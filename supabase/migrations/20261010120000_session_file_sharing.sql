insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('session-files', 'session-files', false, 2097152, null)
on conflict (id) do update
set public = false,
    file_size_limit = 2097152,
    allowed_mime_types = null;
