package realtime

import (
	"log/slog"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// writeWait is the deadline for a single write, including the ping
	// control frame.
	writeWait = 10 * time.Second
	// pongWait is how long we wait for a pong (or any client message)
	// before considering the connection dead.
	pongWait = 75 * time.Second
	// pingPeriod must be well under pongWait so at least one ping lands
	// before the read deadline expires.
	pingPeriod = 30 * time.Second
	// maxMessageBytes bounds inbound frames; clients only send pings and
	// (optionally) a presence heartbeat, never arbitrary payloads.
	maxMessageBytes = 4096
	// outboxSize is how many outbound messages can queue before a slow
	// client is dropped rather than blocking the publisher.
	outboxSize = 32
)

// Client wraps one live WebSocket connection: a buffered outbound channel
// plus the read/write pumps that enforce ping/pong and the message size
// limit described in docs/02-system-design.md section 4.7.
type Client struct {
	conn   *websocket.Conn
	outbox chan []byte
	logger *slog.Logger

	// onClose, if set, runs once when the connection's pumps finish
	// (either side closed, or a timeout), so the caller can unsubscribe
	// from every topic and clear presence without repeating that on every
	// call site that might end a connection.
	onClose func()
}

func newClient(conn *websocket.Conn, logger *slog.Logger, onClose func()) *Client {
	if logger == nil {
		logger = slog.Default()
	}
	return &Client{conn: conn, outbox: make(chan []byte, outboxSize), logger: logger, onClose: onClose}
}

// Send enqueues payload for delivery, dropping the client if its buffer is
// full rather than blocking the publisher goroutine.
func (c *Client) Send(payload []byte) { c.send(payload) }

func (c *Client) send(payload []byte) {
	select {
	case c.outbox <- payload:
	default:
		c.logger.Warn("realtime: client outbox full, dropping connection")
		_ = c.conn.Close()
	}
}

// serve runs both pumps and blocks until the connection closes. Call it in
// its own goroutine from the HTTP handler that performed the upgrade.
func (c *Client) serve() {
	done := make(chan struct{})
	go c.writePump(done)
	c.readPump()
	close(done)
	if c.onClose != nil {
		c.onClose()
	}
}

// readPump only exists to detect disconnects and keep the pong deadline
// alive; the hub does not accept commands from clients over this
// connection.
func (c *Client) readPump() {
	c.conn.SetReadLimit(maxMessageBytes)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait)) //nolint:forbidigo // socket deadlines are wall-clock by definition
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait)) //nolint:forbidigo // socket deadline
	})

	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (c *Client) writePump(done <-chan struct{}) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case payload, ok := <-c.outbox:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait)) //nolint:forbidigo // socket deadline
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		case <-done:
			return
		}
	}
}

// Close closes the underlying connection; the read pump then returns and
// unwinds serve() normally.
func (c *Client) Close() {
	_ = c.conn.Close()
}
