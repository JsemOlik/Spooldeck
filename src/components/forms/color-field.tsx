"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

export function ColorField({ name, defaultValue, id }: { name: string; defaultValue?: string | null; id?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div className="flex gap-2">
      <input
        type="color"
        aria-label="Pick color"
        value={valid ? value : "#888888"}
        onChange={(e) => setValue(e.target.value)}
        className="border-input h-8 w-10 shrink-0 cursor-pointer rounded-lg border bg-transparent p-0.5"
      />
      <Input id={id} name={name} value={value} onChange={(e) => setValue(e.target.value)} placeholder="#ff7a00" className="font-mono" />
    </div>
  );
}
