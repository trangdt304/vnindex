export function number(value, digits = 2) {
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: digits,
  }).format(value);
}

export function compact(value) {
  return new Intl.NumberFormat('vi-VN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function dateLabel(date) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export function dateTime(value, fallback = 'Không rõ thời gian') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function indicatorValue(value, digits = 2) {
  return value == null || !Number.isFinite(value) ? '—' : number(value, digits);
}
