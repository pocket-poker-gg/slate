# Backup & restore

## Backup format

```json
{
  "format": "SLATE_BACKUP",
  "version": 1,
  "exportedAt": "2026-09-11T...",
  "appVersion": "1.0.0",
  "data": {
    "settings": {}, "library": [], "progress": [], "diary": [],
    "lists": [], "listItems": [], "pairwise": [], "recFeedback": [], "titles": []
  }
}
```

`titles` embeds cached metadata so a restored library renders fully even offline.

## Export
Profile -> Back up my library -> Export backup. On iPhone the share sheet opens - save to Files/iCloud Drive. Elsewhere the file downloads.

## Restore
Profile -> Restore backup -> choose the file. Slate validates the format, version, and structure, then shows the backup date and counts (titles, ratings, watched, lists, diary entries) before anything changes. Choose **Merge** (newer local data always wins) or **Replace** (wipes current library tables first). Cancel does nothing.

## Data-safety test
`tests/backup.test.ts` builds a realistic 100-title library (ratings, reviews, diary, episode progress, lists, pairwise choices, settings), exports, wipes, restores, and compares field-by-field. Expected and actual: zero meaningful loss.

## Reminders
Profile -> Back up my library -> reminders: after N changes, monthly, or never. Never naggy, always local.
