# Legal version bridge maintenance

The deployed default is inactive: `_data/legal_versions.json` is `{}` and the generated `_includes/legal-version-links.html` emits nothing. Only the five exact Korean legacy owners in `_config.yml` use `_layouts/legal-version.html`, inheriting the existing default layout. Their original Markdown stays unchanged. Existing extensionless/HTML addresses keep the current Pages behavior. The dated privacy policy, revision notice, guides and English policies have no bridge. There are no redirects, client scripts, runtime fetches or new Pages plugins.

## Review and activation boundary

A future activation requires a separate exact-mapping review and actual external human approval for the exact environment, publication batch, original title/body, manifest and decision. A `reference`, hash, successful compiler run or readback does **not** authenticate human approval or authorize publication. Check the external approval record independently. Do not activate drafts or infer that a version is approved because its ID is well formed.

Keep the root README deployment instructions and existing revision notices. Merging to `master` deploys this site. This change supplies no real mapping, publishes no new policy and sends no notice.

The only accepted mapping keys are:

| Legacy source | documentKey | locale |
| --- | --- | --- |
| `ko/terms/EULA.md` | `terms.service` | `ko` |
| `ko/terms/PrivacyPolicy.md` | `privacy.notice` | `ko` |
| `ko/terms/Personal_Information_Collection_and_Use_Agreement.md` | `privacy.collection` | `ko` |
| `ko/terms/Personal_Information_Transfer_Agreement.md` | `privacy.overseas` | `ko` |
| `ko/terms/ContentOperationsPolicy.md` | `policy.content` | `ko` |

Each mapped value must contain exactly these six string fields:

- `versionId`: canonical `sfom_` plus unpadded base64url of UTF-8 `JSON.stringify([1,"LegalDocumentVersion",rawId])`. Maximum 512 characters; raw ID is nonempty, at most 128 UTF-16 code units, well formed Unicode, without control characters. Decode/re-encode equality is required.
- `documentKey` and `locale`: exact owner values from the table.
- `digest`: lowercase SHA-256 of the original UTF-8 `title + "\n" + body`, without trimming or newline normalization.
- `approvalPacketSha256`: lowercase SHA-256 identifying the exact independently approved publication packet.
- `reference`: external approval record pointer, 1–512 ASCII characters from letters/digits and `:/?&=._~%#@+-`. It is not shown on the policy page. Quotes, whitespace, controls and Liquid delimiters are rejected rather than escaped into a Liquid literal. Unsupported record names should be represented by a stable plain record pointer and reviewed externally.

The offline compiler validates syntax and ownership, then produces deterministic Liquid containing only validated literals. At render time it checks the entire mapping's owner count and every field against the compiled snapshot before emitting any link. Edited, missing or stale mapping data fails closed. A deliberate edit to both data and compiled code still needs review; this is not an approval system. Links always use `https://api.sfom.app/legal/versions/` plus the validated ID and escaped output. The API serves published versions via GET/HEAD without query parameters.

## Read-only verification before a separately approved activation

Do not run this procedure to activate the default empty mapping. For a proposed mapping, first review its exact contents and external approval record. Use Node 24+ and an artifact directory outside this repository. The commands below read public data only; none publishes a version or edits production state. Run once for **each** mapped owner, retaining timestamped captures and the exact mapping/commit alongside the review record.

Set `LEGAL_REVIEW_DIR` to an existing absolute artifact directory and `LEGAL_REVIEW_OWNER` to one table path. Validate a preview outside the source first:

```sh
node _tools/legal-versions.mjs compile _data/legal_versions.json "$LEGAL_REVIEW_DIR/preview.html"
node --input-type=module - "$LEGAL_REVIEW_OWNER" "$LEGAL_REVIEW_DIR" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [owner, dir] = process.argv.slice(2);
const entry = JSON.parse(readFileSync('_data/legal_versions.json', 'utf8'))[owner];
if (!entry) throw new Error('Owner is not mapped');
writeFileSync(join(dir, 'query.json'), JSON.stringify({
  query: 'query BridgeVersion($id: ID!) { legalDocumentVersion(id: $id) { id documentKey locale title body digest publishedAt effectiveAt } }',
  variables: { id: entry.versionId }
}));
writeFileSync(join(dir, 'version-url.txt'), 'https://api.sfom.app/legal/versions/' + entry.versionId);
JS
curl --silent --show-error --fail --proto '=https' --connect-timeout 5 --max-time 15 --max-filesize 2097152 \
  --header 'Content-Type: application/json' --data-binary @"$LEGAL_REVIEW_DIR/query.json" \
  --output "$LEGAL_REVIEW_DIR/version.json" 'https://api.sfom.app/graphql'
curl --silent --show-error --fail --proto '=https' --connect-timeout 5 --max-time 15 --max-filesize 32768 \
  --head --dump-header "$LEGAL_REVIEW_DIR/headers.txt" --output /dev/null \
  "$(cat "$LEGAL_REVIEW_DIR/version-url.txt")"
node _tools/legal-versions.mjs readback _data/legal_versions.json \
  "$LEGAL_REVIEW_DIR/version.json" "$LEGAL_REVIEW_DIR/headers.txt" "$LEGAL_REVIEW_OWNER" \
  > "$LEGAL_REVIEW_DIR/readback-receipt.txt"
```

Do not add `--location`: redirects are not accepted. Review capture failures rather than bypassing them. The readback validator rejects GraphQL errors/null versions, wrong ID/key/locale/digest, future publication timestamps, changed original title/body bytes, and non-200 or mismatched/duplicate public HTML digest headers. It bounds local captured JSON to 2 MiB and headers to 32 KiB. It prints no original body. Its receipt binds the exact mapping-file SHA-256, owner, typed ID, document key, locale, digest and timestamps; retain it with those same captures. A whitespace change to the mapping also changes its exact-file hash. Publication/effect timestamps are integer Unix milliseconds. A future effective date is allowed for an already published version. The operator must ensure files are fresh captures from the exact fixed origin; the offline verifier cannot attest their origin or freshness, nor confirm external approval. A successful readback does not replace that review.

After all readbacks and approval checks, compile the **same** reviewed mapping into the site include, check it, inspect the pair's diff, and build/test before the separate activation PR:

```sh
node _tools/legal-versions.mjs compile
node _tools/legal-versions.mjs check
```

Never hand-edit the generated include or silently carry a readback to a changed mapping. The compiler does not fetch, authenticate approval, publish or deploy. Remove a mapping only through an intentional reviewed change and regenerate the include.

## Local checks and Pages-compatible build

No site runtime dependencies are added. Run the focused standard-library tests and exact generated-output check with Node 24+:

```sh
node --test _tools/legal-versions.test.mjs
node _tools/legal-versions.mjs check
```

The actual Liquid/Jekyll fixture test uses the existing isolated compatible bundle and baseline captured for this work. Set `LEGAL_BASELINE_DIR` to `/Users/rok/Projects/2027_SFOM/jagok-relay-contract/.artifacts/legal-agreements-implementation/operations-completion/site`, containing `Gemfile`, `Gemfile.lock`, `gems/`, `pages-build.yml`, `baseline.json` and `baseline-site/`. Do not reinstall global Ruby. The bundle uses Jekyll 3.10.0, Primer 0.6.0, Liquid 4.0.4 and the four configured standard Pages plugins, with explicit local Ruby 4 stdlib support. Then:

```sh
node --test _tools/legal-jekyll.test.mjs
BUNDLE_GEMFILE="$LEGAL_BASELINE_DIR/Gemfile" BUNDLE_PATH="$LEGAL_BASELINE_DIR/gems" \
  bundle exec jekyll build --source "$PWD" --destination "$LEGAL_REVIEW_DIR/site" \
  --config "$PWD/_config.yml,$LEGAL_BASELINE_DIR/pages-build.yml"
```

The fixture test creates temporary source/build/log directories outside the site and reports their path. It pins only the GitHub build-revision metadata to the captured baseline, then compares all nine pages byte for byte. Active fixtures must differ only by their bridge element. It exercises all five owners and stale unsafe/mismatched/missing/unknown-owner mapping behavior through real Liquid. Readback tests use synthetic local responses and perform no network requests. This local baseline is a renderer comparison, not proof of hosted Pages artifact or routing equivalence; hosted settings/authentication are unchanged. Normal Jekyll underscore exclusion keeps `_tools` private from generated site output.
