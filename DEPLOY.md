# DEPLOY — finish going live (runbook for a fresh session)

This repo is a Vite + React single-page app backed by Supabase, deployed to
Netlify. All the application code is done. This file is the exact, ordered
procedure to take it live. It is written so an AI agent (or a technical person)
in a session **with open network access** can execute it end-to-end.

## Inputs needed (from the owner)
- `SB_TOKEN` — Supabase personal access token (starts with `sbp_`)
- `NF_TOKEN` — Netlify personal access token (starts with `nfp_`)
- Owner email for editing: `ottomahjong@gmail.com`

Store them without echoing:
```bash
umask 077
printf '%s' '<SB_TOKEN>' > /tmp/sb_token
printf '%s' '<NF_TOKEN>' > /tmp/nf_token
SB=$(cat /tmp/sb_token); NF=$(cat /tmp/nf_token)
```

## 0. Confirm network is open
```bash
curl -s -H "Authorization: Bearer $SB" https://api.supabase.com/v1/projects | head -c 200
```
If you see JSON (not "Host not in allowlist"), proceed.

## 1. Find or create the Supabase project
```bash
# List projects -> pick the intended one's "id" (this is the project REF)
curl -s -H "Authorization: Bearer $SB" https://api.supabase.com/v1/projects
```
If none exists, create one:
```bash
ORG=$(curl -s -H "Authorization: Bearer $SB" https://api.supabase.com/v1/organizations | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d)[0].id))')
curl -s -X POST https://api.supabase.com/v1/projects -H "Authorization: Bearer $SB" \
  -H "Content-Type: application/json" -d "{\"organization_id\":\"$ORG\",\"name\":\"the-collection\",\"region\":\"us-east-1\",\"db_pass\":\"$(openssl rand -base64 18)\",\"plan\":\"free\"}"
# Wait until status is ACTIVE_HEALTHY before continuing (poll the projects list).
```
Set `REF` to the project id:
```bash
REF=<project-ref>
```

## 2. Get the project URL and anon key
```bash
SUPABASE_URL="https://$REF.supabase.co"
ANON=$(curl -s -H "Authorization: Bearer $SB" https://api.supabase.com/v1/projects/$REF/api-keys \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const k=JSON.parse(d).find(x=>x.name==="anon");console.log(k.api_key)})')
echo "$SUPABASE_URL"; echo "anon len: ${#ANON}"
```

## 3. Create tables, security rules, image bucket, and seed data
Run the SQL files through the Management API query endpoint:
```bash
run_sql() {
  node -e 'const fs=require("fs");const q=fs.readFileSync(process.argv[1],"utf8");process.stdout.write(JSON.stringify({query:q}))' "$1" \
  | curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
      -H "Authorization: Bearer $SB" -H "Content-Type: application/json" --data-binary @- ; echo
}
run_sql db/schema.sql
run_sql db/seed.sql
```
Both should return `[]` (success). The owner email is hard-coded in
`db/schema.sql`; change it there if the owner ever changes.

**Fresh project:** `schema.sql` is complete and idempotent — you do **not** need
the files in `db/migrations/` (they're already folded into the schema).

**Already-live database:** don't blindly re-seed. Instead apply any migrations
the live DB hasn't seen yet, in order:
```bash
for m in db/migrations/[0-9]*.sql; do echo "applying $m"; run_sql "$m"; done
```
Each migration is idempotent, so this is safe to repeat. See
`db/migrations/README.md` for the convention and a log of what each one does.

## 4. Create the Netlify site
```bash
SITE_JSON=$(curl -s -X POST https://api.netlify.com/api/v1/sites \
  -H "Authorization: Bearer $NF" -H "Content-Type: application/json" \
  -d '{"name":"the-collection-'$(date +%s)'"}')
SITE_ID=$(echo "$SITE_JSON" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).site_id||JSON.parse(d).id))')
SITE_URL=$(echo "$SITE_JSON" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).ssl_url||JSON.parse(d).url))')
echo "site_id=$SITE_ID url=$SITE_URL"
```

## 5. Build with the Supabase keys and deploy
```bash
printf 'VITE_SUPABASE_URL=%s\nVITE_SUPABASE_ANON_KEY=%s\n' "$SUPABASE_URL" "$ANON" > .env
npm install
npm run build
npx --yes netlify-cli@17 deploy --prod --dir=dist --site="$SITE_ID" --auth="$NF"
```
(Also store the env vars on the site so future Git-based builds work:)
```bash
for KV in "VITE_SUPABASE_URL=$SUPABASE_URL" "VITE_SUPABASE_ANON_KEY=$ANON"; do
  K=${KV%%=*}; V=${KV#*=};
  curl -s -X POST "https://api.netlify.com/api/v1/accounts" >/dev/null # noop guard
  curl -s -X PATCH "https://api.netlify.com/api/v1/sites/$SITE_ID" \
    -H "Authorization: Bearer $NF" -H "Content-Type: application/json" \
    -d "{\"build_settings\":{\"env\":{\"$K\":\"$V\"}}}" >/dev/null
done
```

## 6. Point Supabase auth at the live site (so login links work)
```bash
curl -s -X PATCH "https://api.supabase.com/v1/projects/$REF/config/auth" \
  -H "Authorization: Bearer $SB" -H "Content-Type: application/json" \
  -d "{\"site_url\":\"$SITE_URL\",\"uri_allow_list\":\"$SITE_URL,$SITE_URL/admin,http://localhost:5173\"}"
```

## 7. Report
Give the owner:
- The live URL (`$SITE_URL`)
- A reminder: tap **Owner login**, enter `ottomahjong@gmail.com`, open the email
  link to sign in, then use **Manage** to add/edit/delete.
- A reminder they may revoke/regenerate both tokens afterward; the live site
  keeps working (it only uses the public anon key).
