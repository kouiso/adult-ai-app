const LEGAL_LINKS = [
  { href: "#/legal/tos", label: "利用規約" },
  { href: "#/legal/tokushoho", label: "特定商取引法表示" },
  { href: "#/legal/privacy", label: "プライバシーポリシー" },
] as const;

type LegalLinksProps = {
  className?: string;
  linkClassName?: string;
};

export const LegalLinks = ({ className, linkClassName }: LegalLinksProps) => (
  <nav
    aria-label="法務リンク"
    className={["flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs", className]
      .filter(Boolean)
      .join(" ")}
  >
    {LEGAL_LINKS.map((link, index) => (
      <span key={link.href} className="flex items-center gap-3">
        <a
          href={link.href}
          className={[
            "text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline",
            linkClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {link.label}
        </a>
        {index < LEGAL_LINKS.length - 1 ? <span className="text-border">|</span> : null}
      </span>
    ))}
  </nav>
);
