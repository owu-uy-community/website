/**
 * Format seconds into MM:SS format
 * @param totalSeconds - Total number of seconds to format
 * @returns Formatted time string (MM:SS)
 * 
 * @example
 * formatTime(125) // "02:05"
 * formatTime(5)   // "00:05"
 * formatTime(3661) // "61:01" (over an hour)
 */
export function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format seconds into HH:MM:SS format
 * @param totalSeconds - Total number of seconds to format
 * @returns Formatted time string (HH:MM:SS)
 * 
 * @example
 * formatTimeWithHours(3661) // "01:01:01"
 * formatTimeWithHours(125)  // "00:02:05"
 */
export function formatTimeWithHours(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Parse a time string (MM:SS or HH:MM:SS) into total seconds
 * @param timeString - Time string to parse
 * @returns Total seconds
 * 
 * @example
 * parseTimeString("02:05")    // 125
 * parseTimeString("01:01:01") // 3661
 */
export function parseTimeString(timeString: string): number {
  const parts = timeString.split(":").map(Number);
  
  if (parts.length === 2) {
    // MM:SS format
    const [mins, secs] = parts;
    return mins * 60 + secs;
  } else if (parts.length === 3) {
    // HH:MM:SS format
    const [hours, mins, secs] = parts;
    return hours * 3600 + mins * 60 + secs;
  }
  
  return 0;
}

