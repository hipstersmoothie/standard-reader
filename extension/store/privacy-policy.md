# Standard Reader Extension — Privacy Policy

**Last updated:** June 2025

## Overview

The Standard Reader browser extension helps you save articles and follow publications on the [standard.site](https://standard.site) network. It connects to your Standard Reader account at [standard-reader.app](https://standard-reader.app).

## Data the extension accesses

| Data                   | Purpose                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Page URLs**          | Match pages against the Standard Reader index to offer save/follow/open actions                                |
| **Session cookie**     | Authenticate API requests using your existing Standard Reader sign-in (HttpOnly cookie on standard-reader.app) |
| **Extension settings** | Stored locally in `chrome.storage.sync` (overlay toggle, Bluesky embed save button)                              |

## Data the extension does not collect

- We do not operate a separate analytics pipeline in the extension
- We do not sell or share extension data with third parties
- Page content is not uploaded — only URLs are sent to Standard Reader's `/api/extension/*` endpoints

## Account actions

Save and follow actions write AT Protocol records to **your** repository via the Standard Reader server, same as the web app.

## Contact

Questions: support via [standard-reader.app](https://standard-reader.app/about).
