/**
 * Shared shapes for the portal's forms, so two forms asking the same kind
 * of question look like the same product.
 */

/**
 * The number fields, as steppers: a stepper cannot be handed a word. The
 * buttons sit either side of the value rather than stacked on its right —
 * PrimeReact's default puts a tall pair of blocks against the field, which
 * reads as a spinner bolted on rather than a control. Give it a width;
 * a number box stretched across a column looks like a text field.
 */
export const STEPPER = {
  showButtons: true,
  buttonLayout: 'horizontal' as const,
  incrementButtonIcon: 'pi pi-plus',
  decrementButtonIcon: 'pi pi-minus',
  inputMode: 'numeric' as const,
  step: 1,
  useGrouping: false,
};
