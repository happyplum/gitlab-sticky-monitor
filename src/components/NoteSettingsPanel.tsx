import { useState, type KeyboardEvent } from "react";
import { NOTE_COLORS } from "../constants";

export interface NoteFilterState {
  show_issues: boolean;
  show_mrs: boolean;
  only_assigned_to_me: boolean;
  labels: string[];
}

interface NoteSettingsPanelProps {
  currentColor: string;
  filters: NoteFilterState;
  onChangeColor: (color: string) => void;
  onChangeFilters: (filters: NoteFilterState) => void;
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
    onChangeFilters({
      ...filters,
      only_assigned_to_me: !filters.only_assigned_to_me,
    });
  };

  const handleToggleIssues = () => {
    // Keep at least one content tab active
    if (filters.show_issues && !filters.show_mrs) return;
    onChangeFilters({
      ...filters,
      show_issues: !filters.show_issues,
    });
  };

  const handleToggleMrs = () => {
    // Keep at least one content tab active
    if (filters.show_mrs && !filters.show_issues) return;
    onChangeFilters({
      ...filters,
      show_mrs: !filters.show_mrs,
    });
  };

  const handleAddLabel = () => {
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
    onChangeFilters({
      ...filters,
      labels: filters.labels.filter((l) => l !== labelToRemove),
    });
  };

  return (
    <div className="note-settings-overlay">
      <div className="note-settings-card">
        <div className="note-settings-header">
          <span className="note-settings-title">⚙️ 便笺设置与过滤</span>
          <button
            className="note-btn close-btn"
            onClick={onClose}
            title="关闭设置"
          >
            ✕
          </button>
        </div>

        <div className="note-settings-body">
          {/* Color Selection */}
          <div className="settings-field">
            <label className="settings-label">便笺配色</label>
            <div className="settings-colors">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.value}
                  className={`color-dot ${currentColor.toUpperCase() === c.value.toUpperCase() ? "selected" : ""}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => onChangeColor(c.value)}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          {/* Only assigned to me */}
          <div className="settings-field">
            <label className="settings-label">内容筛选</label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={filters.only_assigned_to_me}
                onChange={handleToggleAssigned}
              />
              <span>只看与我相关（指派/评审）</span>
            </label>
          </div>

          {/* Module Visibility */}
          <div className="settings-field">
            <label className="settings-label">展示模块</label>
            <div className="checkbox-group">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={filters.show_issues}
                  onChange={handleToggleIssues}
                />
                <span>显示 Issues</span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={filters.show_mrs}
                  onChange={handleToggleMrs}
                />
                <span>显示 Merge Requests</span>
              </label>
            </div>
          </div>

          {/* Label Filter */}
          <div className="settings-field">
            <label className="settings-label">标签（Labels）过滤</label>
            <div className="label-input-box">
              <input
                type="text"
                placeholder="输入标签名按 Enter 添加..."
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                type="button"
                className="btn-add-label"
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
                    >
                      ×
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
        </div>

        <div className="note-settings-footer">
          <button className="btn-confirm" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
