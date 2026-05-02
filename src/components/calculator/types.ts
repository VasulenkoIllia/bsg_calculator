import type { ReactNode } from "react";

export type ZoneId =
  | "zone0"
  | "zone1a"
  | "zone1b"
  | "zone2"
  | "zone3"
  | "zone4"
  | "zone5"
  | "zone6";

export type ZoneNavigationTarget = {
  id: ZoneId;
  title: string;
};

export type ZoneSectionNavigation = {
  start: ZoneNavigationTarget;
  previous: ZoneNavigationTarget;
  onNavigate: (zoneId: ZoneId) => void;
};

export type ZoneSectionProps = {
  id: ZoneId;
  title: string;
  subtitle?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  navigation?: ZoneSectionNavigation;
  panelClassName?: string;
  headerClassName?: string;
  contentClassName?: string;
};

export type UnifiedProfitabilityNode = {
  id: string;
  label: string;
  value: number;
  formula?: string;
  children?: UnifiedProfitabilityNode[];
};

export type HardcodedConstantItem = {
  label: string;
  value: string;
};

export type HardcodedConstantGroup = {
  title: string;
  items: HardcodedConstantItem[];
};
