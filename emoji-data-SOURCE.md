# Emoji shortcode data

`emoji-data.json` is a compact transformation of GitHub's gemoji `db/emoji.json`, downloaded 2026-10-31. Each entry contains the emoji, its aliases, and whether skin tones are supported. No images are included.

Source: https://github.com/github/gemoji/blob/master/db/emoji.json

Copyright (c) 2019 GitHub, Inc. Distributed under the license reproduced in `gemoji-LICENSE`.

Additional compatibility aliases are defined in `emoji-codec.cjs`. These are standard Unicode emoji aliases; custom Discord server images are not supported. Newly introduced Unicode sequences absent from the dictionary are displayed with a reversible `:unicode_...:` fallback rather than an invented name.
