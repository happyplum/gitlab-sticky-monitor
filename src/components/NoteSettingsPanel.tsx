import { useState, type KeyboardEvent } from "react";
import { NOTE_COLORS } from "../constants";
import { Icon } from "./Icon";
import type { NoteFilters } from "../types/gitlab";

interface NoteSettingsPanelProps {
  currentColor: string;
  filters?: NoteFilters;
  onChangeColor: (color: string) => void;
  onChangeFilters: (filters: NoteFilters) => void;
  onClose: () => void;
}

export function NoteSettingsPanel({
  currentColor,
  filters,
  onChangeColor,
  onChangeFilters,
  onClose,
}: NoteSettingsPanelProps) {
  const [labelInput, setLabelInput] = useState("");

  const handleToggleAssigned = () => {
    if (!filters) return;
    onChangeFilters({
      ...filters,
      only_assigned_to_me: !filters.only_assigned_to_me,
    });
  };

  const handleAddLabel = () => {
    if (!filters) return;
    const trimmed = labelInput.trim();
    if (!trimmed) return;
    if (!filters.labels.includes(trimmed)) {
      onChangeFilters({
        ...filters,
        labels: [...filters.labels, trimmed],
      });
    }
    setLabelInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddLabel();
    }
  };

  const handleRemoveLabel = (labelToRemove: string) => {
    if (!filters) return;
    onChangeFilters({
      ...filters,
      labels: filters.labels.filter((l) => l !== labelToRemove),
    });
  };

  return (
    <div className="note-settings-overlay">
      <div className="note-settings-card">
        <div className="note-settings-header">
          <span className="note-settings-title">
            <Icon name="settings" />
            便笺设置
          </span>
          <button
            className="note-btn close-btn"
            onClick={onClose}
            title="关闭设置"
            aria-label="关闭设置"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="note-settings-body">
          {/* Color Selection */}
          <div className="settings-field">
            <span className="settings-label">便笺配色</span>
            <div className="settings-colors">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.value}
                  className={`color-dot ${currentColor.toUpperCase() === c.value.toUpperCase() ? "selected" : ""}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => onChangeColor(c.value)}
                  title={c.name}
                  aria-label={c.name}
                  aria-pressed={
                    currentColor.toUpperCase() === c.value.toUpperCase()
                  }
                >{currentColor.toUpperCase() === c.value.toUpperCase() && <Icon name="check" />}</button>
              ))}
            </div>
          </div>

          {/* Only assigned to me */}
          {filters && <>
          <div className="settings-field">
            <span className="settings-label">内容筛选</span>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={filters.only_assigned_to_me}
                onChange={handleToggleAssigned}
              />
              <span>只看与我相关（指派/评审）</span>
            </label>
          </div>

          {/* Label Filter */}
          <div className="settings-field">
            <label className="settings-label" htmlFor="note-label">
              标签过滤
            </label>
            <div className="label-input-box">
              <input
                id="note-label"
                type="text"
                placeholder="输入标签名按 Enter 添加..."
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                type="button"
                className="btn btn-small"
                onClick={handleAddLabel}
              >
                添加
              </button>
            </div>
            {filters.labels.length > 0 && (
              <div className="settings-tags">
                {filters.labels.map((lbl) => (
                  <span key={lbl} className="settings-tag">
                    {lbl}
                    <button
                      type="button"
                      onClick={() => handleRemoveLabel(lbl)}
                      title="移除标签"
                      aria-label={`移除标签 ${lbl}`}
                    >
                      <Icon name="close" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <small className="settings-hint">
              {filters.labels.length > 0
                ? "只显示包含上述任意标签的条目"
                : "未设置标签过滤，显示全部"}
            </small>
          </div>
          </>}
        </div>

        <div className="note-settings-footer">
          <button className="btn btn-primary btn-small" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
