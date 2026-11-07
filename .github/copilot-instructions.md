# S Project — GitHub Copilot

Ажил бүрийн өмнө repo-ийн root дахь `AGENTS.md`-г уншиж мөрдөнө (бүх агентын ганц дүрэм). Юу хаана байна → `docs/CONTEXT.md`.

Хамгийн чухал нь (бүтэн нь AGENTS.md-д):
- Хариулт монголоор, товч. Нэг блокийг DB → API → UI → орчуулга (mn/en/zh) → тест хүртэл бүрэн дуусгана; «хөнгөн» хувилбар ✖.
- Дууссан = tsc + eslint + unit + (backend бол) integration ногоон; шалгаагүйг «дууссан» гэхгүй.
- Явцыг зөвхөн одоогийн tech plan-д тэмдэглэнэ; бусад баримт release-д.
- Өгөгдөл устгах migration, `main`-д merge/tag/push, pilot/staging upgrade, `.env*` — хэрэглэгчийн зөвшөөрөлтэй л.
- Windows PowerShell 5.1 (`&&` ✖), pnpm only, Supabase Docker (54322).
