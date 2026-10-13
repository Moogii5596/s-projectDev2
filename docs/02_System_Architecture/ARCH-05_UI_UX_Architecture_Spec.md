---
title: "ARCH-05_UI_UX_Architecture_Spec"
type: "Architecture"
status: "Active"
last_updated: 2026-10-08
tags: [ui]
---

S Project: UI/UX Архитектур & Frontend Спецификаци (v1.1.0)
Баримт бичгийн төрөл: Frontend Technical & UX Architecture Specification
Хамаарах архитектур: Microkernel (OS-like), Hybrid Multi-Tenant (Tier 1, 2, 3), API Gateway Architecture
Үүрэг: Lead Solutions Architect

1. Micro-Frontend Module Integration (Shell & Plug-in Hooks)
S Project-ийн Frontend нь Core Web Shell (Host) ба бие даасан бизнесийн модулиудыг динамикаар холбох Module Federation / Web Components суурьтай Micro-Frontend архитектураар ажиллана. Модуль тус бүр Core Shell-тэй тодорхой гэрээний (UI Contract) дагуу харилцана.
1.1. UI Slot & Extension Model
Core Web Shell нь дараах 3 үндсэн өргөтгөлийн цэгүүдийг (Extension Slots) гаргаж өгнө:
sidebar_menu Slot: Модулийн үндсэн болон дэд навигацийн цэсүүд.
dashboard_widgets Slot: Хянах самбарын картууд, KPI виджетүүд, шуурхай үйлдлийн товчлуурууд.
router-outlet Slot: Модулийн бүрэн эрхт дэлгэцүүд болон route-ууд.
+-------------------------------------------------------------------------------+
| Core Web Shell (Host Application)                                             |
| +-------------------------+-------------------------------------------------+ |
| | Topbar: Tenant Info, Status Badge (Tier/Sync), Profile, Notifications      | |
| +-------------------------+-------------------------------------------------+ |
| | Sidebar                 | Main Content Area                               | |
| | +---------------------+ | +---------------------------------------------+ | |
| | | [sidebar_menu Slot] | | | System Banner / Alert Area (Draining, etc.) | | |
| | | - Core Menus        | | +---------------------------------------------+ | |
| | | - Module A Menu     | | | [dashboard_widgets Slot] or                 | | |
| | | - Module B Menu     | | | [router-outlet Slot]                        | | |
| | +---------------------+ | | (Lazy Loaded Micro-Frontend Module)         | | |
| |                         | +---------------------------------------------+ | |
| +-------------------------+-------------------------------------------------+ |
+-------------------------------------------------------------------------------+
1.2. Модулийн UI Бүртгэлийн Гэрээ (Manifest Schema)
Модуль ачаалагдах үедээ өөрийн UI бүрэлдэхүүн хэсгүүдийг тодорхойлсон дараах гэрээг (Plugin Manifest) Core Shell-д өгнө:
export interface ModuleUIManifest {
  moduleId: string;                  // жишээ нь: "procurement_requisition"
  version: string;                   // "1.1.0"
  lifecycleState: 'ACTIVE' | 'DRAINING' | 'SUSPENDED';
  permissionsRequired: string[];     // ['req.create', 'req.view', 'req.approve']
  
  // 1. Навигацийн цэсний тохиргоо
  sidebar: {
    id: string;
    title: string;
    icon: string;                    // Lucide icon key эсвэл SVG path
    order: number;
    path: string;
    badgeCountEndpoint?: string;     // Жишээ нь: Шинэ шаардах хуудасны тоо
    requiredPermission?: string;
    children?: Array<{
      id: string;
      title: string;
      path: string;
      requiredPermission?: string;
    }>;
  }[];

  // 2. Хянах самбарын виджетүүд
  dashboardWidgets: {
    widgetId: string;
    title: string;
    gridSpan: { cols: number; rows: number }; // Responsive Grid (1-12)
    componentName: string;                    // Federated Module-аас экспортлох нэр
    minPermission?: string;
  }[];

  // 3. Маршрутын бүртгэл (Router Outlet)
  routes: {
    path: string;
    exact?: boolean;
    componentName: string;
    meta: {
      title: string;
      requiresAuth: boolean;
      requiredPermission?: string;
      breadcrumb: string[];
    };
  }[];
}

2. Material Requisition User Flow & Screen States
Хангамжийн материалын шаардах хуудас (Material Requisition) нь олон шатлалт баталгаажуулалт болон санхүү, үлдэгдлийн нарийн валидацитай явагдана.
2.1. Шаардах хуудас үүсгэх маягт (Creation Form)
Header / Мета мэдээлэл:
Шаардах дугаар (Auto-generated), Төсөл/Салбар сонгох, Зориулалт/Тайлбар, Тэргүүлэх зэрэг (Low, Medium, Urgent).
Бараа материалын олон мөрт жагсаалт (Dynamic Line Items):
Item Selector: Код эсвэл нэрээр хайх (Debounced Autocomplete, Сэлбэг/материалын зураг, одоогийн үлдэгдэл харуулах).
UOM (Хэмжих нэгж): Тухайн барааны үндсэн нэгжээр автоматаар ирнэ.
Quantity: Шаардагдах тоо хэмжээ (Динамик бүхэл/бутархай оронгийн хязгаартай).
Estimated Unit Cost & Currency: Сүүлийн худалдан авалтын үнэ эсвэл суурь төсөвт өртөг.
Total Estimated Cost: Quantity * Unit Cost автоматаар мөр бүр дээр тооцогдоно.
Required Date: Тухайн барааг талбай дээр авах шаардлагатай огноо (Date Picker).
Динамик нийлбэр & Төсвийн шалгалт:
Хүснэгтийн доод хэсэгт: Нийт мөрийн тоо, Нийт баримтын дүн (Subtotal, Tax, Grand Total) бодит цаг хугацаанд бодогдоно.
Төсвийн хязгаар давсан тохиолдолд анхааруулах индикатор (Warning: Төсвийн үлдэгдлээс хэтэрсэн тул 2-р шатны санхүүгийн захирлын баталгаажуулалт шаардана).
Client-side & Server-side Валидаци:
Мөр хоосон байж болохгүй (min_items: 1).
Сөрөг эсвэл тэг тоо хэмжээ оруулахыг хориглоно (qty > 0).
Тэргүүлэх зэрэг "Urgent" үед "Яаралтай шаардсан шалтгаан" тайлбар заавал шаардана.
2.2. Батлах урсгалын дэлгэц (Approval Flow & States)
Маягтыг "Илгээх" (Submit) товч дарсны дараа дараах дэлгэцийн төлөвүүдэд шилжинэ:
Pending Approval төлөвт түгжигдсэн харагдац (Read-Only Mode):
Locking Indicator: Дээд хэсэгт шар/цэнхэр статус баж: Төлөв: Батлуулахаар илгээсэн (Хянаж буй: Б. Бат-Эрдэнэ / Салбарын ерөнхий инженер).
Input Lock: Бүх мөр болон талбарууд идэвхгүй (Disabled/Read-only) болно.
Actions Bar (Эрх бүхий шатны хэрэглэгчид): Зөвхөн эрхтэй хүнд Approve (Батлах) болон Reject (Татгалзах) товчнууд тод харагдана.
Татгалзах үеийн шалтгаан нэхэх Modal (Rejection Modal):
Хянагч Reject товч дарах үед модал цонх гарч ирнэ:
Гарчиг: "Шаардах хуудсыг татгалзах"
Талбар 1 (Radio Group): Үндсэн шалтгаан (Төсөв хүрэлцэхгүй, Үлдэгдэл нөөц хангалттай байгаа, Мэдээлэл дутуу/алдаатай, Бусад).
Талбар 2 (Textarea - Заавал оруулах): "Татгалзсан нарийвчилсан шалтгаан, тайлбар (хамгийн багадаа 10 тэмдэгт)".
Товчнууд: "Буцах (Cancel)", "Татгалзахыг баталгаажуулах (Confirm Rejection)" - destructive улаан товч.
Түүхэн Timeline (Audit Trail & Activity Flow):
Дэлгэцийн баруун талд (Drawer эсвэл Timeline block) тухайн баримтын бүх үйл явц дарааллаар тэмдэглэгдэнэ:
Жишээ:
2026-09-20 09:15 | Үүсгэсэн - Хэрэглэгч А.Мөнхбат
2026-09-20 09:20 | Илгээсэн - Шатлал: Төслийн удирдагч
2026-09-20 10:45 | Татгалзсан - Инженер Д.Болд ("Талбайн агуулахад 15 ш нөөц байгаа тул хасаж тооцно уу")
2026-09-20 11:30 | Засаж дахин илгээсэн - Хэрэглэгч А.Мөнхбат

3. Edge Case & Error Handling UI
3.1. Модулийн төлөв: DRAINING болон SUSPENDED
S Project Gateway болон Module Registry-ээс тухайн модулийн төлөв өөрчлөгдөхөд Frontend Shell дараах хариу үйлдлийг үзүүлнэ:
Модулийн Төлөв
UI Индикатор & Байршил
Хэрэглэгчийн Эрх ба Үйлдлүүд
Системийн Ажиллагаа
DRAINING (Шинэчлэл хийгдэх гэж буй, шинэ ажил хүлээн авахгүй үе)
Top Sticky Warning Banner (Шар/Улбар шар): "Анхаарна уу: Энэхүү системд шинэчлэл хийгдэж байна. Одоогийн нээлттэй ажлаа дуусгана уу. Шинээр баримт үүсгэх түр хугацаанд хаагдсан."
Шинээр үүсгэх (Create, New), Хуулах (Duplicate) товчнууд Disabled болж дээр нь tooltip гарна. Зөвхөн одоо нээлттэй байгаа нооргийг хадгалах боломжтой.
WebSocket / Polling-ээр засварын ажлын төгсгөл хүртэлх цагийг харуулна.
SUSPENDED (Түдгэлзүүлсэн, төлбөр төлөгдөөгүй эсвэл ноцтой алдаатай үе)
Full-width Blocking Banner (Улаан) эсвэл Blank Slate Lockout View: "Энэ модуль түдгэлзсэн төлөвт байна. Системийн админд хандана уу."
Бүх бичих (POST, PUT, DELETE) үйлдлүүд бүрэн хаагдана. Дэлгэц зөвхөн харах (Read-Only) горимд шилжих эсвэл бүрэн түгжигдэнэ.
Gateway түвшний 403 Forbidden эсвэл 423 Locked статус кодыг хүлээн авна.

503 Retry Counter (Exponential Backoff UI):
Gateway-аас 503 Service Unavailable эсвэл модулийн сүлжээ унах үед:
Дэлгэцийн баруун доод буланд Toast хэлбэрээр Auto-Retry Counter гарна:
"Сервертэй холбогдож чадсангүй. Дахин холбогдох хугацаа: 5... 4... 3... (Retry 2 of 5)"
Хэрэглэгч хүсвэл хүлээлгүйгээр "Одоо дахин оролдох (Retry Now)" товчийг дарж болно.

4. Tier 3 Offline UI Архитектур (Air-Gapped & Camp Environment)
Уул уурхайн талбар, кэмп болон интернэт тасарсан үед систем PWA (Progressive Web App) болон Service Worker, IndexedDB ашиглан тасралтгүй ажиллах нөхцөлийг бүрдүүлнэ.
4.1. Сүлжээгүй үеийн "Offline Mode" Индикатор
Core Topbar-ийн төлөв: Сүлжээ тасарсан даруйд Topbar дээр саарал/шар өнгийн тод баж байршина:
[ Offline Mode ] ⚡ Талбарын локал горимд ажиллаж байна
Орон нутгийн кэш (IndexedDB):
Сүүлийн үеийн материалын каталог, төслийн мэдээлэл, батлах эрхтэй албан тушаалтнуудын жагсаалтыг локал IndexedDB сан руу кэшилсэн байна.
Баримт үүсгэхэд Offline ID: tmp_req_uuid_v4 үүсгэгдэнэ.
4.2. Локал Баталгаажуулалт (Provisionally Approved Badge)
Талбарын менежер интернэтгүй орчинд шаардах хуудсыг баталсан тохиолдолд:
Статус баж нь ногоон бус, Шаргал хүрээтэй тусгай баж (Striped Pattern) болно:
Provisionally Approved (Локал баталгаажсан)
Бажийн дэргэдэх Tooltip: "Энэхүү баталгаажуулалт нь талбарын локал төхөөрөмжид бүртгэгдсэн бөгөөд төв сервер рүү синк хийгдээгүй байна."
Локал Approval Sign-off (Crypto signature / Public-Private Keypair stored in secure hardware or local secure storage) дарагдаж Outbox дараалалд орно.
4.3. Сүлжээ Сэргэх Үеийн "Sync Status & Conflict Alert" Дэлгэц
+-------------------------------------------------------------------------------+
| Sync Drawer / Notification Center                                             |
| +---------------------------------------------------------------------------+ |
| | [✔ Sync Finished] 12 баримт төв систем рүү амжилттай синк хийгдлээ.        | |
| +---------------------------------------------------------------------------+ |
| | [⚠ Conflict Alert (1)] Нэг баримт дээр зөрчил илэрлээ!                     | |
| |                                                                           | |
| | Баримт: #REQ-2026-0089 (Шатах тослох материал)                             | |
| | Зөрчил: Төв сервер дээр санхүүгийн менежер тус төсвийг аль хэдийн хаасан. | |
| |                                                                           | |
| | [ Хадгалсан локал хувилбар ]            [ Төв серверийн хувилбар ]       | |
| | Төлөв: Provisionally Approved           Төлөв: Budget Frozen / Cancelled  | |
| | Баталсан: Д.Болд (Талбайн инженер)      Шалтгаан: Төсвийн хуваарилалт     | |
| |                                                                           | |
| | Үйлдэл:                                                                   | |
| | [ Серверийн хувилбарыг зөвшөөрөх ]   [ Албадан синк хийх хүсэлт илгээх ]  | |
| +---------------------------------------------------------------------------+ |
+-------------------------------------------------------------------------------+
Auto-Sync Queue (Outbox Worker):
Сүлжээ сэргэх үед Service Worker автоматаар дараалалд байгаа бүх үйлдлийг төвийн Gateway рүү Idempotency-Key-тэйгээр цувуулан илгээнэ.
Conflict Resolution Modal (Зөрчил шийдвэрлэх харагдац):
Хэрэв локал баримтыг батлах хооронд төв сервер дээр тухайн төсвийн үлдэгдэл дууссан эсвэл өөр хэрэглэгч баримтад өөрчлөлт оруулсан бол Conflict Alert Window дэлгэц дээр гарна.
Дэлгэц нь хоёр баганатай харьцуулалт (Diff View: Local State vs. Remote State)-ыг харуулж, дараах сонголтыг хэрэглэгчид өгнө:
Accept Server State (Төвийн хувилбарыг сонгож, локалыг хүчингүй болгох).
Save as New Draft (Зөрчилтэй баримтыг шинэ ноорог болгон хадгалж дахин явуулах).
Force Override (Зөвхөн дээд шатны админ эрхтэй хэрэглэгчид харагдана).

