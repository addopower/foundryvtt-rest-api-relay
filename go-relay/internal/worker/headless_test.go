package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/chromedp/chromedp"
)

// Exercise the production browser script against synthetic join pages only.
// No Foundry instance, credentials, database, or external service is used.
func TestLoginToFoundry(t *testing.T) {
	chrome := findChromeBinary()
	if chrome == "" {
		t.Skip("Chrome/Chromium is required for the headless login regression tests")
	}
	opts := append(chromedp.DefaultExecAllocatorOptions[:], chromedp.ExecPath(chrome), chromedp.NoSandbox)
	allocCtx, allocCancel := chromedp.NewExecAllocator(context.Background(), opts...)
	defer allocCancel()
	browserCtx, browserCancel := chromedp.NewContext(allocCtx)
	defer browserCancel()
	if err := chromedp.Run(browserCtx); err != nil {
		t.Fatalf("start Chrome: %v", err)
	}

	for _, field := range []string{"userId", "userid"} {
		t.Run(field, func(t *testing.T) {
			for _, tc := range []struct {
				name     string
				options  string
				username string
				password string
				wantID   string
				wantErr  string
			}{
				{
					name: "select configured user instead of currently selected user",
					options: `<option value="other" selected>Other GM</option>` +
						`<option value="target-id">  Test GM  </option>`,
					username: "tEsT gM", password: "secret\"\\\n", wantID: "target-id",
				},
				{
					name:     "empty password remains explicit",
					options:  `<option value="target-id">Test GM</option>`,
					username: "Test GM", wantID: "target-id",
				},
				{
					name:     "escaped username and password",
					options:  `<option value="target-id">GM &quot;Quoted&quot;</option>`,
					username: `GM "Quoted"`, password: "quote\" slash\\ newline\n", wantID: "target-id",
				},
				{
					name:     "missing user never posts another user's password",
					options:  `<option value="other" selected>Other GM</option>`,
					username: "Test GM", password: "secret", wantErr: "user not found",
				},
				{
					name: "active user is not submitted",
					options: `<option value="other" selected>Other GM</option>` +
						`<option value="target-id" disabled>Test GM</option>`,
					username: "Test GM", password: "secret", wantErr: "already logged in",
				},
				{
					name:     "disabled group is not submitted",
					options:  `<optgroup label="Active" disabled><option value="target-id">Test GM</option></optgroup>`,
					username: "Test GM", password: "secret", wantErr: "already logged in",
				},
				{
					name:     "placeholder is not an account",
					options:  `<option value="">Test GM</option>`,
					username: "Test GM", password: "secret", wantErr: "user not found",
				},
			} {
				t.Run(tc.name, func(t *testing.T) {
					form := fmt.Sprintf(`<select name="%s">%s</select>`, field, tc.options)
					testFoundryLogin(t, browserCtx, form, tc.username, tc.password, field, tc.wantID, tc.wantErr)
				})
			}
		})
	}

	t.Run("password-only legacy form", func(t *testing.T) {
		testFoundryLogin(t, browserCtx, "", "legacy-id", "", "userid", "legacy-id", "")
	})
}

func testFoundryLogin(t *testing.T, browserCtx context.Context, form, username, password, field, wantID, wantErr string) {
	t.Helper()
	requests := make(chan map[string]string, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/join" {
			w.Header().Set("Content-Type", "text/html")
			fmt.Fprintf(w, `<!DOCTYPE html><form>%s<input name="password" type="password"></form>`, form)
			return
		}
		if r.Method != http.MethodPost || r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("unexpected join request: %s %s", r.Method, r.Header.Get("Content-Type"))
		}
		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode join request: %v", err)
		}
		select {
		case requests <- body:
		default:
			t.Error("unexpected additional join request")
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"success","redirect":"/game"}`)
	}))
	defer server.Close()

	tabCtx, tabCancel := chromedp.NewContext(browserCtx)
	defer tabCancel()
	ctx, cancel := context.WithTimeout(tabCtx, 15*time.Second)
	defer cancel()
	if err := chromedp.Run(ctx, chromedp.Navigate(server.URL)); err != nil {
		t.Fatalf("navigate synthetic join form: %v", err)
	}
	gotID, err := loginToFoundry(ctx, username, password)
	if wantErr != "" {
		if err == nil || !strings.Contains(err.Error(), wantErr) {
			t.Fatalf("login error = %v, want %q", err, wantErr)
		}
		if gotID != "" {
			t.Errorf("rejected login returned user ID %q", gotID)
		}
		if len(requests) != 0 {
			t.Fatal("rejected user caused a POST /join")
		}
		return
	}
	if err != nil || gotID != wantID {
		t.Fatalf("login = (%q, %v), want (%q, nil)", gotID, err, wantID)
	}
	if len(requests) != 1 {
		t.Fatalf("join request count = %d, want 1", len(requests))
	}
	body := <-requests
	if len(body) != 3 || body["action"] != "join" || body[field] != wantID {
		t.Errorf("join body has wrong action, account field, or field count")
	}
	if got, present := body["password"]; !present || got != password {
		t.Error("password was omitted or changed")
	}
}
