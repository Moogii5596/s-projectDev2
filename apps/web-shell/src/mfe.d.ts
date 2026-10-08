// Sprint 4: Module Federation — remote module type declarations
// mfe_requisitions-ийн TypeScript type-ийг зарлах

declare module 'mfe_requisitions/RequisitionApp' {
  import type { ComponentType } from 'react';
  const RequisitionApp: ComponentType;
  export default RequisitionApp;
}
