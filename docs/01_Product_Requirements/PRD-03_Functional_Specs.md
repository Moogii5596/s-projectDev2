---
title: "PRD-03_Functional_Specs"
type: "PRD"
status: "Active"
last_updated: 2026-10-08
tags: [core]
---

PRD-03: Functional Specifications & Reference Module (Material Requisition)
Document ID: PRD-03
Project: S Project
Status: Approved
Version: 1.1.0
Owner: Lead IT Product Manager

1. Ерөнхий Зорилго
Энэхүү баримт бичиг нь S Project-ийн Core Kernel болон Dynamic Reverse Proxy дээр ажиллах анхны суурь лавлах модуль болох Material Requisition (Бараа материалын шаардах хуудас)-ийн функциональ шаардлага, өгөгдлийн бүтэц, CRUD үйлдэл болон workflow-engine дундын модультой харилцах Approval State Machine-ийг тодорхойлно.

2. Shared System Integration: workflow-engine
Core Kernel "Zero Business Logic" байх тул шаталсан зөвшөөрлийн матриц нь Core дотор БИШ, дундын workflow-engine систем модульд төвлөрнө.
Харилцааны зарчим:
Material Requisition модуль нь зөвхөн баримтын DRAFT, төлөв хадгалалт болон бизнес валидацийг хариуцна.
Баримт илгээгдэх үед (SUBMIT) уг модуль Core Event Bus-аар workflow.instance.start эвентийг илгээнэ.
workflow-engine нь тухайн байгууллагын дүрэм (хэлтэс, төсөвт өртөг, албан тушаал)-ийн дагуу батлах дарааллыг үүсгэж удирдан, шат бүрийн үр дүнг эвентээр буцаана.
Material Requisition модуль нь уг эвентийг сонсож өөрийн статусыг шинэчилнэ.

3. Өгөгдлийн Бүтэц (Data Schema)
3.1 Хүснэгт: mr_headers
id (UUIDv7, Primary Key)
tenant_id (UUIDv7, Indexed - PostgreSQL RLS-д ашиглагдана)
mr_number (VARCHAR(50), Unique per Tenant, Жишээ нь: MR-2026-0001 эсвэл Tier 3-д MR-CAMP01-2026-0001)
requested_by (UUIDv7, User ID)
department_id (UUIDv7, Department ID)
required_date (DATE, Шаардагдах огноо)
priority (ENUM: LOW, NORMAL, HIGH, EMERGENCY)
status (ENUM: DRAFT, PENDING_APPROVAL, PROVISIONALLY_APPROVED, APPROVED, REJECTED, FULFILLED, CANCELLED)
total_estimated_amount (DECIMAL(18, 2), Нийт тооцоолсон дүн)
purpose (TEXT, Шаардлагын зорилго, үндэслэл)
rejection_reason (TEXT, Nullable, Татгалзсан шалтгаан)
created_at, updated_at (TIMESTAMPTZ)
3.2 Хүснэгт: mr_items
id (UUIDv7, Primary Key)
mr_id (UUIDv7, Foreign Key -> mr_headers.id, ON DELETE CASCADE)
tenant_id (UUIDv7, Foreign Key)
item_code (VARCHAR(50), Барааны код)
item_name (VARCHAR(255), Барааны нэр)
quantity (DECIMAL(12, 2))
uom (VARCHAR(20), Хэмжих нэгж)
estimated_unit_price (DECIMAL(18, 2))
notes (VARCHAR(255))

4. CRUD Эрхийн Матриц
Үйлдэл (Action)
Draft
Pending Approval
Approved / Provisionally Approved
Rejected / Fulfilled / Cancelled
Create
Эрх бүхий ажилтан үүсгэнэ
Хориглоно
Хориглоно
Хориглоно
Read
Үүсгэгч ажилтан, шууд удирдлага
Үүсгэгч, Тухайн шатны Батлагч нар
Бүх оролцогчид, Нярав, Санхүү
Архивын хяналтын эрхтэй хэрэглэгчид
Update
Зөвхөн үүсгэгч ажилтан
Засварлах боломжгүй (Locked)
Засварлах боломжгүй (Locked)
Засварлах боломжгүй (Locked)
Delete
Зөвхөн үүсгэгч ажилтан (Soft delete)
Устгах боломжгүй
Устгах боломжгүй
Устгах боломжгүй


5. Approval State Machine Logic
                       ┌────────────────────────┐
                       │         DRAFT          │
                       └───────────┬────────────┘
                                   │
                             (SUBMIT_EVENT)
                                   │
                                   ▼
                       ┌────────────────────────┐
        ┌─────────────>│    PENDING_APPROVAL    │<─────────────┐
        │              └───────────┬────────────┘              │
        │                          │                           │
(Дараагийн шат руу:                ├──(REJECT_EVENT)─────────> [ REJECTED ]
 Next Approver)                    │                           │
        │                          │                           │
        └───────(APPROVE_STEP)─────┤                           │
        [Хэрэв олон шатлалт        ▼ (Бүх шат дууссан үед)     │
         батлах шаардлагатай бол] ┌────────────────────────┐   │
                                  │        APPROVED        │   │
                                  └───────────┬────────────┘   │
                                              │                │
                                        (FULFILL_EVENT)        │
                                              │                │
                                              ▼                │
                                  ┌────────────────────────┐   │
                                  │       FULFILLED        │   │
                                  └────────────────────────┘   │
                                                               │
  * Хүсэлт гаргагчийн хүсэлтээр (DRAFT эсвэл PENDING үед): ────┴─> [ CANCELLED ]
5.1 Төлөв Шилжилтийн Дүрмүүд:
DRAFT -> PENDING_APPROVAL (SUBMIT):
Валидаци: Хамгийн багадаа 1 мөр бараа орсон байх (items.length > 0), required_date ирээдүйн огноо байх, нийт дүн тооцоологдсон байх.
Баримт шууд түгжигдэж (Read-Only) workflow.instance.start эвент цацагдана.
PENDING_APPROVAL -> APPROVED (APPROVE):
Tier 1: 1 шатлалт зөвшөөрөл (Хэлтсийн удирдлага зөвшөөрснөөр шууд APPROVED).
Tier 2: Олон шатлалт урсгал (Шат 1: Хэлтсийн дарга -> Шат 2: Санхүү / Төсвийн хянагч).
Tier 3 (Offline Edge Case): Офлайн орчинд криптограф түлхүүрээр гарын үсэг зурагдсан бол локал түвшинд PROVISIONALLY_APPROVED төлөвт шилжиж агуулахаас талбарт бараа гаргах эрх нээгдэнэ. Сүлжээ сэргэх үед төв серверт баталгаажиж APPROVED болно.
PENDING_APPROVAL -> REJECTED (REJECT):
Батлагч татгалзах үед заавал rejection_reason тайлбар бичнэ.
Баримтын статус шууд REJECTED болж, хүсэлт гаргагчид мэдэгдэл очно.
APPROVED -> FULFILLED (FULFILL):
Нярав/Хангамжийн ажилтан агуулахаас барааг бүрэн олгож дууссанаар FULFILLED төлөвт шилжинэ.

6. Manifest.json Тодорхойлолт
Модуль Core Kernel-д бүртгүүлэхдээ дараах метадатаг илгээнэ:
{
  "module_id": "material-requisition",
  "name": "Бараа материалын шаардах хуудас",
  "version": "1.0.0",
  "dependencies": ["core-engine", "workflow-engine"],
  "permissions": [
    "requisition.create",
    "requisition.read",
    "requisition.update",
    "requisition.delete",
    "requisition.approve",
    "requisition.fulfill"
  ],
  "api_routes": {
    "base_path": "/api/v1/requisitions",
    "target_port": 4001
  },
  "ui_hooks": {
    "sidebar_menu": {
      "label": "Шаардах хуудас",
      "icon": "clipboard",
      "path": "/requisitions"
    }
  },
  "events_emitted": [
    "requisition.created",
    "requisition.submitted",
    "requisition.approved",
    "requisition.rejected",
    "requisition.fulfilled"
  ],
  "events_listened": [
    "workflow.step.approved",
    "workflow.completed",
    "workflow.rejected",
    "inventory.stock.issued"
  ]
}

