"use client";

import { parseDate } from "chrono-node";
import { CalendarIcon } from "lucide-react";
import * as React from "react";

import { Calendar } from "@/components/ui/calendar";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

type DatePickerProps = {
  id?: string;
  value?: Date | undefined;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
};

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Tomorrow or next week",
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [textValue, setTextValue] = React.useState("");
  const lastEmittedMs = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (value === undefined) return;
    if (value.getTime() === lastEmittedMs.current) return;
    lastEmittedMs.current = value.getTime();
    setTextValue(formatDate(value));
  }, [value]);

  const parsedFromText = React.useMemo(() => {
    const trimmed = textValue.trim();
    if (trimmed.length === 0) return undefined;
    return parseDate(textValue) ?? undefined;
  }, [textValue]);

  const calendarDate = parsedFromText ?? value;
  const parsedLabel = parsedFromText !== undefined ? formatDate(parsedFromText) : "";
  const showParsedHint =
    parsedFromText !== undefined && textValue.trim().length > 0 && textValue.trim() !== parsedLabel;

  function handleTextChange(nextText: string) {
    setTextValue(nextText);
    const trimmed = nextText.trim();
    if (trimmed.length === 0) {
      lastEmittedMs.current = null;
      onChange?.(undefined);
      return;
    }
    const parsed = parseDate(nextText);
    if (parsed) {
      lastEmittedMs.current = parsed.getTime();
      onChange?.(parsed);
    }
  }

  function handleCalendarSelect(date: Date | undefined) {
    if (date === undefined) return;
    lastEmittedMs.current = date.getTime();
    onChange?.(date);
    setTextValue(formatDate(date));
    setOpen(false);
  }

  return (
    <div className="space-y-1">
      <InputGroup>
        <InputGroupInput
          id={id}
          value={textValue}
          placeholder={placeholder}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <InputGroupButton variant="ghost" size="icon-xs" aria-label="Select date">
                <CalendarIcon />
                <span className="sr-only">Select date</span>
              </InputGroupButton>
            </PopoverTrigger>
            <PopoverContent className="w-auto overflow-hidden p-0" align="end" sideOffset={8}>
              <Calendar
                mode="single"
                selected={calendarDate}
                captionLayout="dropdown"
                defaultMonth={calendarDate}
                onSelect={handleCalendarSelect}
              />
            </PopoverContent>
          </Popover>
        </InputGroupAddon>
      </InputGroup>
      {showParsedHint ? (
        <p className="text-xs text-muted-foreground">{parsedLabel}</p>
      ) : null}
    </div>
  );
}
