# BrainTot extension glossary

The domain utilities exist in the scaffold; capture and queue integration remain planned. See the [README](README.md) for current functionality and setup.

- **Capture**: A planned user action to save the current tab's video URL to BrainTot through the popup. The intended scope is the current URL, not browsing history. The scaffold does not read either.
- **Canonical URL**: The normalized video URL returned by the [URL utility](src/domain/url-canonicalizer.ts). Supported YouTube variants become `https://www.youtube.com/watch?v=ID`; supported TikTok and Facebook reel URLs also receive normalized forms without query parameters.
- **Pending link**: The [domain model](src/domain/pending-link.ts) for a video link awaiting conversion into a lesson. Its allowed transitions are `pending` to `processing`, `processing` to `succeeded` or `failed`, and `failed` to `pending` for retry. The scaffold defines these transitions but does not process links.
- **Queue**: A planned collection of a user's pending links. Firestore synchronization, an extension badge, and a web queue view are intended integration concepts, not implemented extension behavior.
- **Activation**: The start of implementing the planned capture and queue features. It is not a runtime toggle or an available user action in the scaffold.
