# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/3ee144c2-2486-4107-9a3b-61d3d190ffbc

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/3ee144c2-2486-4107-9a3b-61d3d190ffbc) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/3ee144c2-2486-4107-9a3b-61d3d190ffbc) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
# Certificate staff access

The `verifier` role can create certificates, list and view them, open the print view, edit the existing editable fields, and use public certificate verification. Certificate deletion requires an administrator session and that administrator's password. Authenticator enrollment, activation, and recovery require an administrator session.

Run `node --test tests/certificate-roles.test.mjs` with Node.js 24 to exercise these permissions against a local SQLite fixture.

## Cloudflare rollout

1. In Cloudflare Pages, identify the production D1 database bound as `DB`. Confirm `PRAGMA table_info(admin_users);` shows the existing user table and no `role` column. The repository does not contain the original production D1 schema. Apply [the additive migration](migrations/0001_certificate_roles.sql) to that database before publishing the new Pages code. Apply it to any separate preview database used to test the feature as well.
2. Check that the existing users have role `admin` using `SELECT role, COUNT(*) FROM admin_users GROUP BY role;`. The migration keeps the existing password hashes, session records, TOTP records, and certificates in place.
3. Publish the Pages code and confirm an existing administrator can open the certificate list from an established session. Check the public verification page.

## Student register rollout

Before publishing the student register, apply [migration 0008](migrations/0008_students.sql) to the production D1 database bound as `DB` (and to any preview database). It creates a separate student register; existing certificates and mark sheets remain unchanged. The `/students` page and `/api/students` endpoints require an administrator session. Archiving keeps the student record and can be reversed from the archived records view.

## Provision a confirmed verifier

After confirming the recipient email and permissions, a Cloudflare administrator with D1 write access can run `node scripts/prepare-verifier.mjs <confirmed-email>` in a private terminal. The command generates a random password and an insert statement. It does not connect to D1. Use the insert in the production D1 console after deployment, verify that it inserted one row, and share the generated password privately with the intended recipient. Keep the generated password and statement out of source control and shared logs. An existing email is never updated by the statement.

To revoke access, update the intended account to `role = 'disabled'` with a `WHERE` clause that matches its ID and current `verifier` role. This blocks new logins and existing sessions while retaining certificate attribution. To restore access, issue a new password hash and remove that account's old sessions before reenabling it.
