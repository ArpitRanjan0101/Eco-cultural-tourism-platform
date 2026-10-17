// Minimal internal icon set (no icon library). Icons are decorative: the control supplies the accessible name.
function Svg({ children, className = 'size-4', ...rest }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className} {...rest}>
      {children}
    </svg>
  );
}

export const ChevronLeftIcon = (props) => <Svg {...props}><path d="m15 18-6-6 6-6" /></Svg>;
export const ChevronRightIcon = (props) => <Svg {...props}><path d="m9 18 6-6-6-6" /></Svg>;
export const ChevronDownIcon = (props) => <Svg {...props}><path d="m6 9 6 6 6-6" /></Svg>;
export const ChevronUpIcon = (props) => <Svg {...props}><path d="m18 15-6-6-6 6" /></Svg>;
export const CloseIcon = (props) => <Svg {...props}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
export const MenuIcon = (props) => <Svg {...props}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>;
export const CheckIcon = (props) => <Svg {...props}><path d="M20 6 9 17l-5-5" /></Svg>;
export const AlertIcon = (props) => <Svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></Svg>;
export const InfoIcon = (props) => <Svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></Svg>;
export const ExternalIcon = (props) => <Svg {...props}><path d="M14 4h6v6M10 14 20 4M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></Svg>;
export const SortIcon = (props) => <Svg {...props}><path d="m7 15 5 5 5-5M7 9l5-5 5 5" /></Svg>;
