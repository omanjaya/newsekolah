package realtime

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
)

// BearerSubprotocol is the Sec-WebSocket-Protocol convention used by browser
// clients, which cannot set an Authorization header on a WebSocket
// handshake: they instead negotiate a subprotocol literally named
// "bearer.<token>". The server must echo this exact subprotocol back in the
// handshake response or browsers reject the connection.
const BearerSubprotocol = "bearer"

// ExtractBearer returns the caller's access token from either the
// Authorization header (native/mobile clients, and tests) or the
// Sec-WebSocket-Protocol "bearer.<token>" convention (browsers).
func ExtractBearer(r *http.Request) (token, subprotocol string, ok bool) {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer "), "", true
	}

	for _, proto := range websocket.Subprotocols(r) {
		if rest, found := strings.CutPrefix(proto, BearerSubprotocol+"."); found && rest != "" {
			return rest, proto, true
		}
	}
	return "", "", false
}

// OriginChecker builds a gorilla websocket.Upgrader.CheckOrigin function
// that allows only the tenant's configured AppOrigins (docs/08-security.md
// section 7: no endpoint, including realtime, accepts an arbitrary
// origin), plus requests with no Origin header at all (native app clients,
// which do not send one).
func OriginChecker(appOrigins []string) func(r *http.Request) bool {
	allowed := make(map[string]bool, len(appOrigins))
	for _, o := range appOrigins {
		allowed[o] = true
	}
	return func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		return allowed[origin]
	}
}

// Upgrade completes the WebSocket handshake and registers the connection
// under topic. Callers must authenticate/authorize the request themselves
// first (this package has no notion of a user or a permission): the
// scheduling module's transport layer verifies the bearer token via
// identity's session lookup, or the monitor display token via a
// constant-time comparison, before ever calling this function.
//
// Upgrade does not block; it starts the client's read/write pumps in a new
// goroutine and returns immediately so the caller (an oapi-codegen strict
// middleware, which cannot itself return a "no response" outcome cleanly)
// can return right after.
func Upgrade(w http.ResponseWriter, r *http.Request, hub *Hub, topic string, appOrigins []string, logger *slog.Logger) (*Client, error) {
	upgrader := websocket.Upgrader{
		CheckOrigin:     OriginChecker(appOrigins),
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}

	var responseHeader http.Header
	_, subprotocol, ok := ExtractBearer(r)
	if ok && subprotocol != "" {
		upgrader.Subprotocols = []string{subprotocol}
	}

	conn, err := upgrader.Upgrade(w, r, responseHeader)
	if err != nil {
		return nil, err
	}

	client := newClient(conn, logger, nil)
	client.onClose = func() { hub.Unsubscribe(topic, client) }
	hub.Subscribe(topic, client)

	go client.serve()
	return client, nil
}
