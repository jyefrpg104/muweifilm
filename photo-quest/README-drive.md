# Photo Quest personal Google Drive backup

Open https://www.muweifilm.com/photo-quest/#records, then choose **連接 Google Drive**.
Use the Google account configured as the sole OAuth test user. The first connection
requires Google's consent screen. Once connected, stable task changes are saved
locally first and automatically synchronized after a short debounce.

## Stored data

- Current task, shooting count, completed walks, favorites, and deletion/undo events.
- No photos, access tokens, client secret, or Google password are stored in the backup.
- A visible `Photo Quest` folder contains `latest.json`, per-device JSON files, and
  one immutable dated snapshot on the first successful synchronization of each day.
- Dated snapshots older than 30 calendar days (Asia/Taipei) move to Drive Trash.
  Current and per-device data retain all completed walks, independent of that window.
- JSON files use the existing export format and can be imported through the App.

## Restore and conflicts

Connecting merges completed walks and favorites while keeping this device's current
task. **還原雲端任務** previews the most recently edited cloud task before replacing
the current one; a different outgoing combination is retained as a favorite.

Archive and favorite changes use timestamped events. Deletions and undo travel across
devices instead of silently resurrecting old records. Per-device files retain writes
if devices race on `latest.json`; the next sync reconciles those files. This is
eventual reconciliation, not a transactional database. A second tab modifying the
same local storage pauses synchronization until reload.

## Authorization and availability

Google Identity Services uses the browser token model and `drive.file`, limited to
files used by this App. The OAuth client ID is public; there is no client secret in
the website. Account identity is checked against a hash of the personal account.
Tokens remain only in memory. Reopening the App or token expiry requires a user click
on **重新連線** before pending changes can upload. Failed requests retry up to three
times while the page stays open. **中斷連線** stops synchronization and leaves both
local and cloud data intact.

Offline edits are still saved in localStorage. This is not an offline-installable
PWA: loading the website for the first time requires a network connection.

## Daily backup when the App is closed

The browser version only creates dated snapshots while successfully synchronizing.
It cannot run after the App closes. A Google Apps Script daily trigger must be set up
separately to copy the already synchronized Drive data each day and retain 30 days.
That cloud schedule is **not yet installed**. It cannot copy edits that have never
left the device.

## Verification

Run:

```sh
node tests/photo-quest-drive.test.cjs
node tests/photo-quest-app-storage.test.cjs
```

Tests cover local format migration, real App deletion/undo persistence, token expiry,
wrong-account rejection, offline retry, multi-device merge, edits during network
requests, cancellation, corrupt metadata, daily snapshots, and retention boundaries.
