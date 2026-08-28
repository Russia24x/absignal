# RULES — Git & Sync Protocol (قوانین اجباری)

این فایل قوانین **غیرقابل‌مذاکره**‌ی کار با git در این پروژه است.
هر agent یا توسعه‌دهنده‌ای که روی این ریپو کار می‌کند **باید** قبل از هر کاری این فایل را بخواند و این قوانین را رعایت کند.

This file contains **NON-NEGOTIABLE** git rules for this repository.
Every agent/developer MUST read this file and follow these rules before doing any work.

---

## Rule 1 — NEVER-FORCE-PUSH (هرگز force push نزن)

**فارسی:**

- `git push --force` و `git push --force-with-lease` و هر شکل دیگری از force push **مطلقاً ممنوع** است.
- اگر push عادی با خطای `non-fast-forward` یا `rejected` مواجه شد:
  1. **همین حالا STOP کن** — هیچ push یا commit دیگری انجام نده
  2. وضعیت را کامل گزارش بده: `git fetch origin` → `git status` → `git log --oneline --graph --all -20` و تفاوت دقیق local/remote
  3. **منتظر تصمیم صریح مالک پروژه بمان**
- بازنویسی تاریخچه‌ی commit های push شده (rebase / amend / filter-branch و مشابه آن‌ها) نیز ممنوع است.

**English:**

- `git push --force` / `git push --force-with-lease` / any kind of force push: **ABSOLUTELY FORBIDDEN**.
- If a normal push is rejected (`non-fast-forward` / `rejected`):
  1. **STOP immediately** — do not push or commit anything else
  2. Report the full state: `git fetch origin` → `git status` → `git log --oneline --graph --all -20` + exact local/remote difference
  3. **Wait for the owner's explicit decision**
- Rewriting the history of already-pushed commits (rebase / amend / filter-branch, etc.) is likewise forbidden.

---

## Rule 2 — SESSION-START-SYNC-CHECK (چک همگام‌سازی ابتدای هر session)

**فارسی:**

در ابتدای هر session — و بعد از هر وقفه‌ی زمانی — **قبل از هر تغییر جدید**:

1. `git fetch origin`
2. `git status` و مقایسه‌ی local با `origin/main`
3. اگر local **behind** یا **diverged** بود: **STOP فوری**، گزارش کامل بده و منتظر تصمیم مالک بمان. هیچ تغییر/commit/push جدیدی انجام نده.
4. فقط اگر clean / up-to-date / identical بود: ✅ ادامه‌ی کار مجاز است.
5. نتیجه‌ی این چک را در ابتدای گزارش همان session ذکر کن.

**English:**

At the start of EVERY session (and after any time gap), BEFORE making any new changes:

1. `git fetch origin`
2. `git status` + compare local `main` against `origin/main`
3. If local is **behind** or **diverged** → **STOP immediately**, report fully, and wait for the owner's decision. Do not make any new changes/commits/pushes.
4. Only if clean / up-to-date / identical → ✅ you may proceed.
5. State the result of this sync check at the top of that session's report.

---

## Repository

- Remote: `https://github.com/Russia24x/absignal` — default branch: `main`
- Secret files are git-ignored and must **never** be committed: `.env*`, `db/*.db`, `*.db-journal`
- Token/credentials live only in the local `.git/config` remote URL — never write them into any tracked file.
