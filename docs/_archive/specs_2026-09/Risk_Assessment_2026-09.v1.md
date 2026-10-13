---
title: "S Project - System Risk Assessment & Audit Report"
type: "Log"
status: "Archived"
last_updated: 2026-10-13
tags: [security]
---

> 🗄 **Архив (2026-10-13):** 2026-09-ийн анхны хувилбар — одоогийн бодит байдалтай зөрнө (Kubernetes/gRPC/PgBouncer/`SET LOCAL`/Express г.м.). **Одоогийн баримт: [[ARCH-00_System_Overview]].** Хөгжүүлэлтэд ашиглахгүй — зөвхөн түүх, санаа сэргээхэд.


S PROJECT: SYSTEM RISK ASSESSMENT & AUDIT REPORT
Төсөл: S Project (Hybrid SaaS Multi-Tenant & Microkernel Architecture)
Үүрэг: QA Lead & System Risk Auditor (Devil's Advocate)
Огноо: 2026-09-20
Төлөв: Critical Findings & Action Plan
1. RLS & Multi-Tenancy эрсдэл (PostgreSQL Row-Level Security & Connection Pooling)
1.1. Бодит цоорхой ба Өгөгдөл алдагдах (Leakage) нөхцөлүүд
PgBouncer / Transaction-level Pooling ба SET LOCAL алдагдах:
Аппликейшн түвшинд SET LOCAL app.current_tenant_id = '...' тохируулж RLS хэрэгжүүлдэг үед хэрэв хүсэлт транзакцийн гадна (autocommit=true эсвэл Session-level pooling горимд) хийгдвэл холболт pool рүү буцахдаа цэвэрлэгдэхгүй (RESET ALL / DISCARD ALL дуудагдахгүй).
Дараагийн өөр тенантын хүсэлт тухайн pooled connection-ийг авч ажиллуулах үед өмнөх тенантын tenant_id хэвээр үлдэж, cross-tenant өгөгдөл задрах ноцтой цоорхой үүснэ.
Superuser / Table Owner Privilege Bypass:
ORM эсвэл аппликейшны микросервисүүдийн DB холболтын хэрэглэгч нь хүснэгтийн OWNER эсвэл SUPERUSER эрхтэй байх.
PostgreSQL-ийн үндсэн тохиргоогоор хүснэгтийн эзэмшигч болон superuser-т RLS бодлого үйлчилдэггүй. Хэрэв ALTER TABLE table_name FORCE ROW LEVEL SECURITY; хийгээгүй бол RLS бүрэн bypass хийгдэнэ.
Async Background Workers / Cron Jobs дээр Context тасрах:
HTTP Middleware дээр JWT-ээс tenant_id-г салган DB session-д оноодог ч, background queue (Celery, BullMQ, Kafka Consumer) ажиллах үед context metadata дутуу дамжих эсвэл default утга авснаар бүх тенантын өгөгдөл дээр mass-update/delete хийгдэх эрсдэлтэй.
1.2. Хамгаалах Тестийн Төлөвлөгөө (Test Matrix)
Тестийн төрөл
Шалгах нөхцөл
Хүлээгдэж буй үр дүн
Leakage Under Load
100 concurrent worker-оор 2 өөр тенантын өгөгдөл унших/бичих хүсэлтийг зэрэг илгээх.
leakage_count == 0
Connection Poisoning
Connection аваад алдаа (ROLLBACK) гарган транзакцийг таслах ба тухайн connection-ийг дахин дуудах.
current_setting('app.current_tenant_id') утга хоосон байх.
Bypass Verification
DB хэрэглэгчийн эрх ба FORCE RLS тохиргоог шалгах.
BYPASSRLS эрхгүй, FORCE RLS идэвхтэй байх.

2. Concurrency & Race Condition (Approval Workflow & Optimistic Locking)
2.1. Versioning ба Давхар баталгаажуулалтын цоорхой
Blind Retry Storm (Тохироогүй дахин оролдлого):
Олон батлагч нэгэн зэрэг батлах/татгалзах товч дарах үед version зөрчигдөж StaleObjectStateException / 0 rows affected авна.
Хэрэв систем сохроор шинэ версийг татаж аваад retry хийвэл "Reject" хийсэн баримт буцаад "Approved" болох, эсвэл төлөвийн логик эвдрэх ноцтой гажуудал үүснэ.
State Transition үеийн Side-Effect Давхардалт:
Батлах үйлдэл нь үлдэгдэл нөөцлөх (reserve inventory), ERP руу PO үүсгэх гадаад дуудлагуудыг хийдэг бол баазад roll back хийгдсэн ч гадаад системд хүсэлт очсон байх race condition үүснэ.
2.2. Загварын шийдэл (Mitigation Strategy)
Pessimistic State Lock: Батлах/Татгалзах эгзэгтэй төлөвийн шилжилт дээр SELECT id, status, version FROM requisitions WHERE id = :id FOR UPDATE NOWAIT ашиглан нэг агшинд зөвхөн нэг шилжилтийг зөвшөөрөх.
Idempotency Key: Батлагчийн үйлдлээс ирэх хүсэлт бүрт action_id (UUID) хавсаргаж, давхардсан даралтыг хаах.
3. Event Bus ба Тасархай урсгал (Outbox Pattern & DLQ дутагдал)
3.1. Dual-Write Problem ба Эвент гээгдэх эрсдэл
Requisition модуль бааздаа COMMIT хийгээд дараа нь Event Bus руу эвент илгээхэд сүлжээ тасарвал эвент гээгдэнэ. Эвент түрүүлж цацаад бааз унавал Ghost Event үүснэ.
Workflow-engine унтарсан үед unacknowledged message-үүд хуримтлагдан мессеж гээгдэх эрсдэлтэй.
3.2. Архитектурын шаардлага: Transactional Outbox & Resilient Consumer
Transactional Outbox Table: outbox_events хүснэгт үүсгэж, үндсэн бизнес өгөгдлийн шинэчлэлттэй хамт нэг локал DB транзакцид баталгаажуулах.
Reliable Publisher: CDC (Change Data Capture) эсвэл worker ашиглан outbox хүснэгтээс брокер луу at-least-once зарчмаар нийлүүлэх.
Dead Letter Queue (DLQ): Боловсруулж чадаагүй эвентийг 3 удаагийн exponential backoff retry-ийн дараа DLQ руу шилжүүлж, анхааруулга (alert) илгээх.
4. Tier 3 Split-Brain & Offline Sync (Operative Human Errors in sync_conflicts)
4.1. Зөрчил шийдвэрлэх үед гарах хүний хүчин зүйлийн эрсдэлүүд
"Last Write Wins" сохроор сонгох алдаа: Баримтыг сүүлийн огноогоор автоматаар эсвэл оператор бөөнөөр шийдсэнээр төвөөс хийсэн санхүүгийн болон лимитийн засварыг дарж устгах.
Нөхцөлт хамаарлын (Referential Integrity) тасралт: Мөр мэдээлэл болон толгой мэдээллийг өөр өөр хувилбараас салган шийдсэнээр тооцоолол зөрөх.
Үлдэгдлийн сөрөг баланс (Negative Inventory): Офлайн үед бараа олгогдсон, төвд мөн хуваарилагдсан үед буруу шийдвэр гаргаснаар үлдэгдэл сөрөг болох.
4.2. Алдаанаас сэргийлэх UI/UX болон Процессын Хяналт
Three-Way Merge UI (Diff Viewer): Local болон Remote хувилбараас гадна Base Version-ийг хамт харуулах.
Дүрэмд суурилсан авто шийдвэрлэлт: Санхүү болон төлөвийн талбарууд дээр гар сонголт хийлгэхгүй, төвийн эрхийг давуу болгох.
4-Eyes Principle (Хос хяналт): Өндөр дүнтэй болон эгзэгтэй зөрчлийг ахлах мэргэжилтний давхар баталгаажуулалтаар шийдэх.
Дүгнэлт ба Зөвлөмж
RLS / Multi-Tenancy (CRITICAL): Connection pool дээр RESET ALL автоматжуулах ба бүх хүснэгтэд FORCE ROW LEVEL SECURITY тохируулах.
Concurrency Lock (HIGH): Сохор retry-г хориглож, төлөвийн шилжилт бүрт Pessimistic DB lock (FOR UPDATE NOWAIT) ашиглах.
Event Bus (CRITICAL): Transactional Outbox Pattern болон DLQ нэвтрүүлэх.
Offline Sync Conflicts (HIGH): Field-level 3-way diff харуулах, deterministic бизнес дүрмээр эрсдэлийг хаах.

Баталгаажуулсан:
Person
Auditor Signature
