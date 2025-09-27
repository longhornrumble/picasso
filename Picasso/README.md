🛠 Developer Playbook

A simple guide for working locally, staying clean, and shipping to production with GitHub.
Keep it simple — add complexity later as needed.

⸻

📂 Folder Organization

~/dev/
  picasso/            # frontend (React)
  lambdas/            # backend AWS Lambda functions
  infra/              # infrastructure as code
  sandbox/            # scratch files (ignored by Git)

	•	sandbox/ → always ignored in .gitignore. Use it for temporary tests or notes.
	•	Each real project has one clone. No duplicates.

⸻

🔄 Daily Workflow
	1.	Start fresh

git checkout main
git pull --rebase


	2.	Create a feature branch

git checkout -b feature/my-feature


	3.	Do your work
	•	Edit files, run locally, test.
	•	Save often with commits:

git add .
git commit -m "Describe my change"


	4.	Push to GitHub

git push origin feature/my-feature


	5.	Open a Pull Request (PR)
	•	Title = short description (“Add streaming chat UI”)
	•	Merge into main when satisfied.
	6.	Clean up branches

git checkout main
git pull
git branch -d feature/my-feature
git push origin --delete feature/my-feature



⸻

🧹 Daily Upkeep
	•	Update your local main:

git checkout main
git pull --rebase


	•	Clean ignored clutter (safe):

git clean -fdX


	•	Remove old branches:

git fetch --prune



⸻

🚀 Dev → Prod Pipeline
	•	main = production branch.
	•	Work happens in feature branches, merged by PR.
	•	Production deploy comes from main:
	•	Frontend (Picasso) → build → upload to S3 → invalidate CloudFront.
	•	Lambdas → package → deploy via SAM/CDK.

(Early stage: you can deploy from local. Goal: move deploys into GitHub Actions so prod always = main.)

⸻

🗓 Housekeeping Rhythm
	•	Daily → branch, commit, push, PR.
	•	Weekly → clean ignored files, prune merged branches.
	•	Monthly → organize docs/examples, refresh dependencies.

⸻

✅ Quick Rules
	1.	Never commit directly to main.
	2.	Branch per feature or fix.
	3.	Commit + push often.
	4.	PR into main → merge → delete branch.
	5.	Use sandbox/ for scratch, not the repo.
	6.	Deploy from GitHub (long term).

⸻
