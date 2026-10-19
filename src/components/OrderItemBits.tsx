/* Un renglón de comanda: cantidad y nombre, y debajo la opción y la
 * aclaración si las hay. La aclaración va en cursiva para que cocina la
 * vea distinta del plato. */
export const OrderItemBits = ({
  quantity,
  name,
  option,
  note,
}: {
  quantity: number;
  name: string;
  option?: string | null;
  note?: string | null;
}) => (
  <span className="min-w-0">
    <span className="font-semibold tabular-nums">{quantity} ×</span> {name}
    {option ? <span className="mt-0.5 block text-[0.92em] font-semibold leading-snug">{option}</span> : null}
    {note ? <span className="mt-0.5 block text-[0.92em] italic leading-snug opacity-80">{note}</span> : null}
  </span>
);
