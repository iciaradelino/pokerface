/**
 * Button with the variants from docs/style.md.
 * variant: "lime" (primary action) | "ink" | "call" | "outline" | "ghost" | "danger"
 * size: "secondary" (44px) | "primary" (52px) | "hero" (60px, e.g. Start game)
 */
export function Button({
  variant = 'outline',
  size = 'secondary',
  block = false,
  type = 'button',
  className = '',
  children,
  ...props
}) {
  const classes = [
    'btn',
    `btn--${variant}`,
    size !== 'secondary' && `btn--${size}-size`,
    block && 'btn--block',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}
