/** 1, "night" → "1 night"; 3, "night" → "3 nights"; 2, "child", "children" → "2 children". */
export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}
