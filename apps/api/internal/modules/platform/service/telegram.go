// telegram.go makes the two outbound calls to api.telegram.org this
// module needs: listing recent chats (so the console can offer a "detect
// chat" picker) and sending a test message. Both take a short timeout and
// never let the bot token reach a log line or an error message -- the
// token travels only in the request URL, and any transport-level error
// (which for net/http's *url.Error embeds that URL) is replaced with a
// generic sentinel before it can propagate.
package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
)

// telegramTimeout bounds every call to api.telegram.org: the console (or
// the internal monitor endpoint's caller) must never hang waiting on a
// third party.
const telegramTimeout = 8 * time.Second

// telegramMaxBodyBytes caps how much of a Telegram response this reads,
// defensive against a misbehaving or malicious endpoint returning an
// unbounded body.
const telegramMaxBodyBytes = 1 << 20 // 1 MiB

var telegramHTTPClient = &http.Client{Timeout: telegramTimeout}

// telegramEnvelope is the {"ok": ..., "result": ..., "description": ...}
// shape every Telegram Bot API method responds with.
type telegramEnvelope struct {
	OK          bool            `json:"ok"`
	Result      json.RawMessage `json:"result"`
	Description string          `json:"description"`
}

// telegramCall POSTs method against token's bot, with body marshaled as
// the JSON request payload when non-nil. It never returns an error that
// embeds token or the request URL.
func telegramCall(ctx context.Context, token, method string, body any) (json.RawMessage, error) {
	url := "https://api.telegram.org/bot" + token + "/" + method

	var reqBody io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("telegram: encode request: %w", err)
		}
		reqBody = bytes.NewReader(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, reqBody)
	if err != nil {
		// err from http.NewRequestWithContext never embeds url on a
		// well-formed URL, but stay defensive: never propagate it.
		return nil, domain.ErrTelegramRequest
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := telegramHTTPClient.Do(req)
	if err != nil {
		// A transport error from Do (timeout, DNS failure, refused
		// connection, ...) is a *url.Error that embeds the request URL --
		// and therefore the token. Never wrap or log it; the caller gets
		// only the generic sentinel.
		return nil, domain.ErrTelegramRequest
	}
	defer func() { _ = resp.Body.Close() }()

	data, err := io.ReadAll(io.LimitReader(resp.Body, telegramMaxBodyBytes))
	if err != nil {
		return nil, domain.ErrTelegramRequest
	}

	var envelope telegramEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		return nil, domain.ErrTelegramRequest
	}
	if !envelope.OK {
		desc := envelope.Description
		if desc == "" {
			desc = "unknown error"
		}
		return nil, fmt.Errorf("%w: %s", domain.ErrTelegramAPI, desc)
	}
	return envelope.Result, nil
}

// telegramChatRef is the `chat` object shape shared by every update kind
// this module reads (message, edited_message, channel_post,
// my_chat_member): only the fields DetectOperatorAlertChats needs.
type telegramChatRef struct {
	ID        int64  `json:"id"`
	Type      string `json:"type"`
	Title     string `json:"title"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
}

func (c telegramChatRef) candidate() domain.TelegramChatCandidate {
	title := c.Title
	if title == "" {
		title = c.Username
	}
	if title == "" {
		title = c.FirstName
	}
	if title == "" {
		title = fmt.Sprintf("Chat %d", c.ID)
	}
	return domain.TelegramChatCandidate{ID: c.ID, Type: c.Type, Title: title}
}

// telegramUpdate is the subset of Telegram's Update object that carries a
// chat: a plain message, an edited message, a channel post, or a
// my_chat_member notification (fired when the bot is added to/removed
// from a chat -- often the only update a brand-new bot has before anyone
// sends it a message).
type telegramUpdate struct {
	Message *struct {
		Chat telegramChatRef `json:"chat"`
	} `json:"message"`
	EditedMessage *struct {
		Chat telegramChatRef `json:"chat"`
	} `json:"edited_message"`
	ChannelPost *struct {
		Chat telegramChatRef `json:"chat"`
	} `json:"channel_post"`
	MyChatMember *struct {
		Chat telegramChatRef `json:"chat"`
	} `json:"my_chat_member"`
}

// telegramGetUpdates lists the distinct chats seen across token's recent
// updates (Telegram's getUpdates, long-poll disabled by omitting
// `timeout`), in the order first seen.
func telegramGetUpdates(ctx context.Context, token string) ([]domain.TelegramChatCandidate, error) {
	result, err := telegramCall(ctx, token, "getUpdates", nil)
	if err != nil {
		return nil, err
	}

	var updates []telegramUpdate
	if err := json.Unmarshal(result, &updates); err != nil {
		return nil, domain.ErrTelegramRequest
	}

	seen := map[int64]bool{}
	var out []domain.TelegramChatCandidate
	add := func(chat *telegramChatRef) {
		if chat == nil || seen[chat.ID] {
			return
		}
		seen[chat.ID] = true
		out = append(out, chat.candidate())
	}
	for _, u := range updates {
		if u.Message != nil {
			add(&u.Message.Chat)
		}
		if u.EditedMessage != nil {
			add(&u.EditedMessage.Chat)
		}
		if u.ChannelPost != nil {
			add(&u.ChannelPost.Chat)
		}
		if u.MyChatMember != nil {
			add(&u.MyChatMember.Chat)
		}
	}
	return out, nil
}

// telegramSendMessage sends text to chatID using token (Telegram's
// sendMessage).
func telegramSendMessage(ctx context.Context, token, chatID, text string) error {
	_, err := telegramCall(ctx, token, "sendMessage", map[string]string{
		"chat_id": chatID,
		"text":    text,
	})
	return err
}
