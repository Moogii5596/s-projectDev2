PRD-04: UI/UX Architecture & Interaction Specification
Баримт бичгийн ID: PRD-04 / UI-SPEC-01
Төсөл: S Project
Төлөв: Approved
Хувилбар: 1.1.0
Хамаарах фолдер: 01_Product_Requirements/PRD-04_UI_UX_Architecture_Spec.md
Эзэмшигч: Lead Solutions Architect & Lead IT Product Manager

1. Micro-Frontend Slot & Plug-in Model (UI Contract)
S Project-ийн Frontend нь Core Web Shell (Host Runtime) ба бие даасан бизнесийн микро-фронтендүүдийг агуулсан Module Federation / Isolated Custom Elements (Web Components) хосолсон микрокернел загвараар ажиллана.
1.1 Slot Architecture & Layout Structure
Core Shell нь UI-ийн 3 үндсэн өргөтгөлийн цэгийг (Slot) гаргаж, модулийн manifest.json дээр үндэслэн динамикаар render хийнэ.
+-----------------------------------------------------------------------------------------+
| [Core Web Shell Topbar]                                                                 |
| Tenant: [OT-South-Camp ▼] | Mode: [ Tier 3 / Offline Mode ⚡ ] | User: B.Bat (Field Mgr) |
+-----------------------------------------------------------------------------------------+
| [sidebar_menu Slot]      | [Main Application Stage]                                     |
| +----------------------+ | +----------------------------------------------------------+ |
| | Core Menus           | | | System Alert Banner Slot (DRAINING / SUSPENDED / Sync)    | |
| | - Dashboard          | | +----------------------------------------------------------+ |
| | - Settings           | | | [dashboard_widgets Slot] or [router-outlet Slot]          | |
| |                      | | |                                                          | |
| | Dynamic Plugin Items | | | (Federated Remote Module Component Loaded Here)          | |
| | - Requisitions (MR)  | | |                                                          | |
| | - Warehouse Ops      | | |                                                          | |
| +----------------------+ | +----------------------------------------------------------+ |
+-----------------------------------------------------------------------------------------+
1.2 Module UI Plugin Contract (TypeScript Interface)
Модуль бүр Core Shell-д өөрийгөө бүртгүүлэхдээ дараах интерфейсийг хангасан байна:
export interface ModuleUIPluginContract {
  moduleId: string;                       // Жишээ нь: "material-requisition"
  version: string;                        // "1.1.0"
  lifecycleState: 'ACTIVE' | 'DRAINING' | 'SUSPENDED';
  permissionsRequired: string[];          // ["requisition.create", "requisition.approve"]

  // 1. Sidebar Menu Hook
  sidebarMenu: {
    id: string;
    label: string;
    icon: string;                         // Lucide Icon identifier
    order: number;
    path: string;                         // Frontend route path
    badgeCountHook?: string;              // Батлах хүлээгдэж буй тоо харуулах Event / Hook
    requiredPermission?: string;
    children?: Array<{
      id: string;
      label: string;
      path: string;
      requiredPermission?: string;
    }>;
  }[];

  // 2. Dashboard Widgets Hook
  dashboardWidgets: {
    widgetId: string;
    title: string;
    gridSize: { cols: number; rows: number }; // 12-column responsive layout
    componentRef: string;                     // Lazy-loaded component export нэр
    requiredPermission?: string;
  }[];

  // 3. Router Outlet Hooks
  routes: {
    path: string;
    exact?: boolean;
    componentRef: string;
    meta: {
      title: string;
      requiresAuth: boolean;
      requiredPermission?: string;
      breadcrumbs: Array<{ label: string; path?: string }>;
    };
  }[];
}

2. Material Requisition User Flow & Screen States
2.1 Маягт Үүсгэх Дэлгэц (Create Requisition Form)
Header / Мета Мэдээлэл:
MR Number: Автомат үүснэ (Tier 1/2: MR-YYYY-XXXXX, Tier 3: MR-[NODE_PREFIX]-YYYY-XXXXX). Засах боломжгүй.
Department: Хэрэглэгчийн харьяалагдах хэлтэс автоматаар сонгогдоно (Өөрчлөх эрх зөвшөөрөгдсөн бол Select).
Priority: Radio pills [LOW, NORMAL, HIGH, EMERGENCY]. EMERGENCY сонгоход "Яаралтай шаардсан үндэслэл" textarea заавал нэхэгдэнэ.
Required Date: Date Picker (Ирээдүйн огноо байх validation дүрэмтэй: required_date >= today()).
Бараа Материалын Олон Мөрт Хүснэгт (Dynamic Items Grid):
Item Code / Name: Debounced Search Autocomplete. Сонгоход хэмжих нэгж (UOM), сүүлийн үнийн санал (Estimated Unit Price) шууд бөглөгдөнө.
Quantity: Numeric Input. Эерэг утга авна (qty > 0). 0 болон сөрөг утга оруулахыг хориглоно.
Estimated Unit Price: Тооцоолсон нэгжийн үнэ (MNT).
Line Total: Quantity * Estimated Unit Price бодит цагт автоматаар тооцогдоно.
Actions: Мөр нэмэх (+ Add Item), Мөр хуулах, Мөр устгах (Delete).
Footer / Дүнгийн Нэгтгэл & Validation State:
Нийт мөрийн тоо, Баримтын нийт өртөг (total_estimated_amount) real-time шинэчлэгдэнэ.
Validation Rules:
Барааны жагсаалт хоосон байж болохгүй (items.length >= 1).
required_date заавал өнөөдрөөс хойших огноо байна.
Үйлдлийн товчнууд:
Save as Draft (Төлөв: DRAFT, засварлах эрх нээлттэй үлдэнэ).
Submit for Approval (Баталгаажуулалт хийгдэж, төлөв PENDING_APPROVAL болж түгжигдэнэ).
2.2 Батлах Урсгалын Дэлгэц (Approval Flow & States)
Маягтыг Submit хийсний дараа баримт PENDING_APPROVAL төлөвт шилжинэ:
PENDING_APPROVAL Түгжигдсэн Харагдац (Read-Only State):
Бүх талбарууд, барааны мөрүүд disabled / readonly болно.
Дээд буланд Шар өнгийн төлөвийн баж: [ ⏳ Хянагдаж байна: 1-р шат (Хэлтсийн удирдлага) ].
Хэрэв тухайн нэвтэрсэн хэрэглэгч нь тус шатны батлах эрхтэй этгээд бол доод хэсэгт Үйлдлийн самбар нээгдэнэ:
[ Approve ] (Ногоон товч).
[ Reject ] (Улаан товч).
Татгалзах Үеийн Modal (Rejection Modal):
Хянагч Reject товч дарахад дэлгэц дээгүүр Modal нээгдэнэ.
Талбарууд:
Татгалзсан үндсэн шалтгаан (Select): BUDGET_EXCEEDED, STOCK_AVAILABLE, INVALID_SPEC, OTHER.
Дэлгэрэнгүй тайлбар (Textarea, Заавал): Хамгийн багадаа 10 тэмдэгт шаардана.
[ Confirm Rejection ] дарснаар төлөв REJECTED болж, баримт түүхэнд бичигдэнэ.
Шат Дамжлагын Түүхэн Timeline (Activity & Audit Trail Component):
Баримтын баруун талд (Drawer эсвэл хажуугийн самбар) бүх өөрчлөлтийг цагийн дарааллаар харуулна:
2026-09-20 08:45 | Үүсгэсэн - Б.Батжаргал (Field Engineer)
2026-09-20 08:47 | Илгээсэн - Шатлал: Төслийн менежер рүү шилжсэн
2026-09-20 08:52 | Татгалзсан / Баталсан - С.Эрдэнэ (Төслийн менежер) — "Төсөвт суугдсан тул зөвшөөрөв"

3. Тусгай Төлөвүүдийн Зан Төлөв (Edge-case UI)
3.1 Модуль DRAINING болон SUSPENDED Төлөвт Ажиллах UI
Gateway болон Module Registry-ээс төлөв өөрчлөгдөхөд Core Web Shell доорх байдлаар зохицуулна:
Модулийн Төлөв
UI Мэдэгдэл / Banner
Хэрэглэгчийн Үйлдлүүдийн Хязгаарлалт
Техникийн Зохицуулалт
DRAINING (Шинэчлэл хийгдэж буй)
Top Floating Warning Banner (Шар): "Анхаар: Системд шинэчлэлт хийгдэж байна. Шинээр шаардах хуудас үүсгэх түр хаагдсан. Нээлттэй байгаа баримтуудаа дуусгана уу."
Create New, Duplicate, Submit товчнууд Disabled болж дээр нь tooltip гарна. Зөвхөн одоо нээлттэй байгаа нооргийг хадгалах боломжтой.
Gateway түвшнээс Mutation хүсэлтүүдэд 503 Service Maintenance буцаана.
SUSPENDED (Түдгэлзүүлсэн / Түр хаасан)
Full-width Lockout Banner (Улаан): "Энэ модуль түдгэлзсэн (Suspended) төлөвт байна. Зөвхөн харах горимд ажиллана."
Бүх бичих (POST, PUT, DELETE) үйлдлүүд хориглогдоно. Form control-ууд бүрэн түгжигдэнэ.
Зөвхөн GET хүсэлтүүд зөвшөөрөгдөж Read-Only архивын дэлгэц харагдана.

503 Retry Counter (Exponential Backoff UI Toast):
Gateway-ээс 503 Service Unavailable эсвэл Retry-After: 15 хариу ирэх үед:
Дэлгэцийн баруун доод буланд динамик Counter бүхий Toast байршина:
"Систем завгүй байна. 15... 14... 13 секундийн дараа автоматаар дахин холбогдоно (Retry 1 of 5)"
Гараар шууд турших [ Retry Now ] болон [ Cancel ] товчлууруудтай.

4. Tier 3 Offline Mode & Conflict Protocol UI
Уул уурхайн кэмп, интернэтгүй алслагдсан талбарын дэд бүтцэд (Tier 3 Air-Gapped) систем нь Offline-First PWA (IndexedDB + Service Worker) зарчмаар тасралтгүй ажиллана.
4.1 Сүлжээ Тасарсан Үеийн Offline Индикатор
Topbar Status Indicator:
Сүлжээ тасрах үед Topbar-ын төлөв шууд Online (Ногоон)-оос [ ⚡ Offline Mode / Local Edge Node ] (Шар/Саарал импульстэй тэмдэг) болж солигдоно.
Tooltip: "Талбарын локал сервертэй ажиллаж байна. Сүлжээ сэргэх үед төв систем рүү автоматаар синхрончлогдоно."
Локал баримт үүсгэхэд автоматаар UUIDv7 үүсч, sync_status = 'LOCAL_PENDING' төлөвтэйгөөр IndexedDB-д бичигдэнэ.
4.2 Локал Ed25519 Баталгаажуулалт (PROVISIONALLY_APPROVED Badge)
Интернэтгүй үед талбарын удирдагч баримтыг батлах үед:
Батлагчийн төхөөрөмжийн Local Vault-д хадгалагдсан Ed25519 Private Key-ээр баримтын SHA-256 hash дээр криптограф гарын үсэг зурагдана.
Баримт нь ногоон бус, Шаргал судалтай онцгой баж (Provisionally Approved) харагдана:
[ ⚡ PROVISIONALLY APPROVED (Кэмпэд баталгаажсан) ]
Энэ төлөвт талбарын агуулахаас бараа олгох (Warehouse Dispatch) эрх локал түвшинд нээгдэнэ.
4.3 Сүлжээ Сэргэх Үеийн Синк ба Conflict Resolution Дэлгэц
Сүлжээ холбогдох үед Outbox Worker нь багц өгөгдлийг (Sync Batch Envelope) төв сервер рүү илгээнэ.
Conflict Alert Modal (Мөргөлдөөн Шүүх Дэлгэц):
Хэрэв офлайн байх хооронд төв сервер дээр тухайн төсвийн лимит хаагдсан эсвэл төвийн удирдлага баримтыг цуцалсан бол систем Conflict Resolution Drawer/Modal-ийг операторт үзүүлнэ:
+----------------------------------------------------------------------------------------------------+
| ⚠ ӨГӨГДЛИЙН МӨРГӨЛДӨӨН ИЛЭРЛЭЭ (Sync Conflict Detected: #MR-CAMP01-2026-0042)                     |
+----------------------------------------------------------------------------------------------------+
| Зөрчлийн тайлбар: Талбарт Ed25519 гарын үсгээр баталгаажсан боловч Төв серверт Төсөв хаагдсан байна. |
+-------------------------------------------------+--------------------------------------------------+
| ТАЛБАРЫН ХУВИЛБАР (LOCAL EDGE)                  | ТӨВ СЕРВЕРИЙН ХУВИЛБАР (REMOTE HEAD)             |
+-------------------------------------------------+--------------------------------------------------+
| Төлөв: PROVISIONALLY_APPROVED                   | Төлөв: BUDGET_FROZEN / CANCELLED                 |
| Баталсан: С.Эрдэнэ (Талбайн менежер)            | Өөрчилсөн: Г.Төгөлдөр (Санхүүгийн дарга)         |
| Огноо: 2026-09-20 08:50:00 (Ed25519 Verified)   | Огноо: 2026-09-20 08:48:15                       |
| Бодит олголт: Талбарын агуулахаас олгогдсон ✔   | Шалтгаан: Улирлын төсөв хэтэрсэн                 |
+-------------------------------------------------+--------------------------------------------------+
| ЗӨРЧИЛ ШИЙДВЭРЛЭХ ДҮРЭМ (PRD-02 Field Precedence Бодлого):                                         |
| [X] Талбарын бодит үйлдлийг давуу эрхээр баталгаажуулах (Force Field Precedence Override)           |
| [ ] Төвийн хувилбарыг сонгож, локал үйлдлийг алдааны журналд бичих (Accept Server State)            |
+----------------------------------------------------------------------------------------------------+
| [ Cancel ]                                         [ Баталгаажуулж Синк Гүйцээх (Resolve & Sync) ] |
+----------------------------------------------------------------------------------------------------+
Field Precedence Policy: PRD-02 болон архитектурын дүрмийн дагуу хэрэв талбарт бодит ажиллагаа явагдаж бараа гарсан бол төв систем дээр локал төлөв давамгайлж, төв серверт тусгай CONFLICT_RESOLVED_OVERRIDE аудитын тэмдэглэл үлдээнэ.
Операторын сонголт: Синк хийгдэж дууссаны дараа дэлгэц дээр "1 зөрчил амжилттай шийдвэрлэгдэж, төв сервер рүү синк хийгдлээ" гэсэн ногоон Toast гарна.

