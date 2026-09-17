import type { ClassificationLabel } from "@/lib/engine/condition";

export const CLASSIFICATION_META: Record<
  ClassificationLabel,
  { label: string; color: string; bg: string; border: string; text: string; dot: string; description: string }
> = {
  SEASONAL: {
    label: "Seasonal dip",
    color: "#3aa0ff",
    bg: "bg-class-seasonal/10",
    border: "border-class-seasonal/40",
    text: "text-class-seasonal",
    dot: "bg-class-seasonal",
    description: "A recurring, recovering pattern for this trade — not a sign of risk.",
  },
  STRUCTURAL: {
    label: "Structural decline",
    color: "#ff5c6c",
    bg: "bg-class-structural/10",
    border: "border-class-structural/40",
    text: "text-class-structural",
    dot: "bg-class-structural",
    description: "A steady decline with no seasonal explanation — genuine risk.",
  },
  TEMPORARY: {
    label: "Temporary shock",
    color: "#f5a623",
    bg: "bg-class-temporary/10",
    border: "border-class-temporary/40",
    text: "text-class-temporary",
    dot: "bg-class-temporary",
    description: "A one-off setback that's already recovering.",
  },
  IMPROVING: {
    label: "Improving",
    color: "#3ecf8e",
    bg: "bg-class-improving/10",
    border: "border-class-improving/40",
    text: "text-class-improving",
    dot: "bg-class-improving",
    description: "A sustained upward trend, beyond seasonal recovery.",
  },
  STABLE: {
    label: "Stable",
    color: "#8b93a7",
    bg: "bg-class-stable/10",
    border: "border-class-stable/40",
    text: "text-class-stable",
    dot: "bg-class-stable",
    description: "In line with her typical pattern. Nothing unusual.",
  },
};

export function classificationMeta(label: ClassificationLabel) {
  return CLASSIFICATION_META[label];
}
