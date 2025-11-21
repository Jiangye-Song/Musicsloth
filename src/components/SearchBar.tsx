interface SearchBarProps {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ placeholder, value, onChange }: SearchBarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "15px 20px",
        backgroundColor: "#1a1a1a",
        borderBottom: "1px solid #333",
        gap: "10px",
      }}
    >
      <span style={{ fontSize: "20px" }}>🔍</span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          padding: "10px 15px",
          backgroundColor: "transparent",
          border: "none",
          color: "#fff",
          fontSize: "16px",
          outline: "none",
        }}
      />
    </div>
  );
}
