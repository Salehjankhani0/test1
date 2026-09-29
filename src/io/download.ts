export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadText(name: string, text: string, mime = 'text/plain'): void {
  downloadBlob(name, new Blob([text], { type: mime + ';charset=utf-8' }));
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = () => {
      resolve(input.files && input.files[0] ? input.files[0] : null);
      input.remove();
    };
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export function safeName(s: string): string {
  return (s || 'project').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 60) || 'project';
}
