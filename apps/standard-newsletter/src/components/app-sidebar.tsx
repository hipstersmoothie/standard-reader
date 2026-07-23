import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";

import { PUBS } from "../data/publications";
import { C, kfmt } from "../theme";
import { I, Ico } from "./icons";
import { PubGlyph } from "./ui";

function NavRow({
  active,
  leading,
  label,
  badge,
}: {
  active: boolean;
  leading: ReactNode;
  label: string;
  badge?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        minWidth: 0,
        padding: "7px 10px",
        borderRadius: 9,
        color: active ? C.t12 : C.a11,
        background: active ? C.sel5 : hover ? C.hover4 : "transparent",
        transition: "background .12s",
        fontWeight: active ? 600 : 500,
        fontSize: 14,
      }}
    >
      {leading}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>
      {badge != null && (
        <span
          style={{
            flex: "none",
            fontSize: 11,
            color: C.mut,
            background: C.ui3,
            borderRadius: 20,
            padding: "1px 8px",
            fontFamily: C.mono,
          }}
        >
          {badge}
        </span>
      )}
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: C.mut,
        padding: "0 10px",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

const linkReset = { textDecoration: "none", display: "block" } as const;

export function AppSidebar() {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      style={{
        width: 266,
        flex: "none",
        height: "100%",
        borderRight: `1px solid ${C.b6}`,
        background: C.warm,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "22px 20px 14px 24px", display: "flex" }}>
        <Link to="/" title="Home" style={linkReset}>
          <span
            style={{
              fontFamily: C.serif,
              fontSize: "1.3rem",
              fontWeight: 500,
              letterSpacing: "-0.02em",
              lineHeight: 1,
              color: C.t12,
            }}
          >
            Standard <span style={{ color: C.a9 }}>Newsletter</span>
          </span>
        </Link>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          padding: "4px 12px 24px",
        }}
      >
        <div>
          <SectionLabel>Overview</SectionLabel>
          <Link to="/dashboard" style={linkReset}>
            <NavRow
              active={pathname === "/dashboard"}
              leading={<Ico d={I.grid} />}
              label="Dashboard"
            />
          </Link>
        </div>

        <div>
          <SectionLabel>Publications</SectionLabel>
          {PUBS.map((p) => (
            <Link
              key={p.id}
              to="/p/$pubId"
              params={{ pubId: p.id }}
              style={linkReset}
            >
              <NavRow
                active={pathname.startsWith(`/p/${p.id}`)}
                leading={<PubGlyph pub={p} size={22} r={6} fs={12} />}
                label={p.name}
                badge={kfmt(p.subs)}
              />
            </Link>
          ))}
        </div>
      </div>

      <div style={{ padding: "8px 12px 12px", position: "relative" }}>
        {menuOpen && (
          <>
            <div
              onClick={() => setMenuOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 20 }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 60,
                left: 12,
                right: 12,
                zIndex: 30,
                background: C.warm,
                border: `1px solid ${C.b6}`,
                borderRadius: 12,
                boxShadow: "0 20px 44px -20px rgba(40,30,20,0.5)",
                padding: 6,
              }}
            >
              {[
                { label: "View profile", icon: I.user },
                { label: "Sender settings", icon: I.mail },
                { label: "Settings", icon: I.settings },
              ].map((m) => (
                <MenuRow key={m.label} label={m.label} icon={m.icon} />
              ))}
              <div style={{ height: 1, background: C.b6, margin: "6px 4px" }} />
              <MenuRow label="Log out" icon={I.logout} destructive />
            </div>
          </>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: "8px 10px",
            width: "100%",
            border: "none",
            background: "transparent",
            borderRadius: 10,
            cursor: "pointer",
            font: "inherit",
          }}
        >
          <Avatar name="Mara Delgado" />
          <span
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              minWidth: 0,
              flex: 1,
              textAlign: "left",
            }}
          >
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: C.t12,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Mara Delgado
            </span>
            <span
              style={{
                fontSize: 12,
                color: C.mut,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              @mara.dispatch.site
            </span>
          </span>
          <Ico d={I.chevD} s={16} style={{ flex: "none", color: C.mut }} />
        </button>
      </div>
    </div>
  );
}

function MenuRow({
  label,
  icon,
  destructive = false,
}: {
  label: string;
  icon: string;
  destructive?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 10px",
        borderRadius: 8,
        fontSize: 14,
        cursor: "pointer",
        color: destructive ? "#a33a2a" : C.t12,
        background: hover ? C.hover4 : "transparent",
      }}
    >
      <span>{label}</span>
      <Ico d={icon} s={17} style={{ color: destructive ? "#a33a2a" : C.mut }} />
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        background: C.a9,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 600,
        flex: "none",
        fontFamily: C.sans,
      }}
    >
      {initials}
    </div>
  );
}
