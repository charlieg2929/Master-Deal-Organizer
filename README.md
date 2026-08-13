# Field Ledger

Private off-market prospecting tracker for Tier 1 Properties. Just you and Ryne —
no public signup, no public data.

## 1. Set up Supabase (the database)

1. Go to supabase.com, open your project (or create one — name it something like `field-ledger`).
2. In the left sidebar, click **SQL Editor** > **New query**.
3. Open `supabase-schema.sql` from this folder, copy the whole thing, paste it in, click **Run**.
   This creates the `properties` and `contacts` tables and locks them down so only logged-in users can touch them.
4. In the left sidebar, click **Authentication** > **Providers**, and make sure **Email** is enabled.
   Under Authentication settings, turn **OFF** "Allow new users to sign up" — this app has no signup form,
   but this is a second lock on the door.
5. In the left sidebar, click **Authentication** > **Users** > **Add user** (top right).
   Create one for yourself and one for Ryne — email + password, "Auto Confirm User" checked.
6. In the left sidebar, click **Project Settings** > **API**. You'll need two values from this page
   in step 3 below:
   - **Project URL**
   - **anon / public** key (NOT the service_role key — never use that one in this app)

## 2. Push this code to GitHub

1. Go to github.com, click **New repository**. Name it `field-ledger`, keep it **Private**, don't add a README (you already have one).
2. On the new repo's page, click **uploading an existing file**.
3. Drag every file and folder from this project into that upload box, then **Commit changes**.
   (`node_modules` doesn't exist yet, so there's nothing large to worry about.)

## 3. Deploy on Vercel

1. Go to vercel.com, click **Add New** > **Project**.
2. Import the `field-ledger` GitHub repo you just created.
3. Before clicking Deploy, expand **Environment Variables** and add both:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL from Supabase step 6
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon/public key from Supabase step 6
4. Click **Deploy**. After a minute or two you'll get a live URL like `field-ledger.vercel.app`.

## 4. Sign in and add it to your home screen

1. Open the Vercel URL on your phone.
2. Sign in with the email/password you created in Supabase step 5.
3. iPhone (Safari): tap the Share icon > **Add to Home Screen**.
   Android (Chrome): tap the ⋮ menu > **Add to Home screen** / **Install app**.
4. Have Ryne do the same on his phone, signing in with his own account.

You'll both see the same live data — nothing local, nothing device-specific.

## Notes

- Only accounts you manually create in Supabase can log in. There's no way for anyone else to get in.
- If you ever want a third person in (an EA, for instance), repeat step 5 above for them.
- If you lose the Vercel URL, it's always visible in your Vercel dashboard under the project name.
