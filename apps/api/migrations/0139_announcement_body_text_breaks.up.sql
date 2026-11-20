-- Re-derives announcements.body_text from body_html with a space at every
-- line and block break. The service used to strip the tags with nothing
-- in their place, so "<p>hadir.</p><p>Pakaian</p>" was stored as
-- "hadir.Pakaian" and notifications, search and previews showed the
-- sentences glued together. New and edited rows are derived correctly by
-- the service (service/content.go sanitize); this fixes the rows already
-- stored. body_html was sanitised on the way in, so it holds only tags
-- and the five entities the sanitiser escapes.
update announcements
set body_text = btrim(regexp_replace(
  replace(replace(replace(replace(replace(replace(replace(
    regexp_replace(
      regexp_replace(body_html, '<br\s*/?>|</(p|div|li|h[1-6]|blockquote|pre|tr|td|th)\s*>', ' ', 'gi'),
      '<[^>]*>', '', 'g'),
    '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#34;', '"'), '&#39;', ''''), '&nbsp;', ' '), '&amp;', '&'),
  '\s+', ' ', 'g'))
where body_html ~* '<br\s*/?>|</(p|div|li|h[1-6]|blockquote|pre|tr|td|th)\s*>';
