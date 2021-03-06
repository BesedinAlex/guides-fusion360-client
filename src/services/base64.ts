export function base64ToBlob(base64: string): Blob {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, {type: 'application/pdf'});
}

export function arrayBufferToBase64(arraybuffer: number[]): string {
    const arrayBufferString =
        new Uint8Array(arraybuffer).reduce((data, byte) => data + String.fromCharCode(byte), '');
    return btoa(arrayBufferString);
}
