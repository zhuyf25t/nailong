import type { ToolKind } from '../../../objects/training/ToolKind.ts';

export interface ToolDescription {
  readonly kind: ToolKind;
  readonly name: string;
  readonly subtitle: string;
  readonly effect: string;
  readonly constraint: string;
  readonly specs: string;
}
