import fs from "fs";
import path from "path";
import zlib from "zlib";

/**
 * Pure Node.js zero-dependency streaming ZIP archiver.
 * Implements PKZIP 2.0 format using Node's native zlib (deflateRaw and crc32).
 * Works across all operating systems and environments without external npm packages.
 */
export interface ZipFileEntry {
    name: string;
    filePath?: string;
    content?: Buffer | string;
}

function dateToDosTime(d: Date): { dosDate: number; dosTime: number } {
    const year = Math.max(1980, d.getFullYear());
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const seconds = Math.floor(d.getSeconds() / 2);

    const dosDate = ((year - 1980) << 9) | (month << 5) | day;
    const dosTime = (hours << 11) | (minutes << 5) | seconds;
    return { dosDate, dosTime };
}

export async function createZipArchive(
    entries: ZipFileEntry[],
    outputZipPath: string
): Promise<{ compressedBytes: number }> {
    const writeStream = fs.createWriteStream(outputZipPath);
    const centralDirectoryHeaders: Buffer[] = [];
    let currentOffset = 0;
    const now = new Date();
    const { dosDate, dosTime } = dateToDosTime(now);

    for (const entry of entries) {
        let uncompressedData: Buffer;
        if (entry.content) {
            uncompressedData = typeof entry.content === "string" ? Buffer.from(entry.content, "utf8") : entry.content;
        } else if (entry.filePath && fs.existsSync(entry.filePath)) {
            uncompressedData = fs.readFileSync(entry.filePath);
        } else {
            continue;
        }

        const uncompressedSize = uncompressedData.length;
        const crc = zlib.crc32(uncompressedData);
        const compressedData = zlib.deflateRawSync(uncompressedData, { level: 6 });
        const compressedSize = compressedData.length;

        // Ensure normalized filename with forward slashes
        const normalizedName = entry.name.replace(/\\/g, "/");
        const nameBuffer = Buffer.from(normalizedName, "utf8");

        // Local file header (30 bytes + name length)
        const localHeader = Buffer.alloc(30 + nameBuffer.length);
        localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
        localHeader.writeUInt16LE(20, 4);         // Version needed (2.0)
        localHeader.writeUInt16LE(0x0800, 6);     // General purpose bit flag (UTF-8 filename)
        localHeader.writeUInt16LE(8, 8);          // Compression method: Deflate
        localHeader.writeUInt16LE(dosTime, 10);   // Last mod time
        localHeader.writeUInt16LE(dosDate, 12);   // Last mod date
        localHeader.writeUInt32LE(crc, 14);       // CRC-32
        localHeader.writeUInt32LE(compressedSize, 18);   // Compressed size
        localHeader.writeUInt32LE(uncompressedSize, 22); // Uncompressed size
        localHeader.writeUInt16LE(nameBuffer.length, 26); // File name length
        localHeader.writeUInt16LE(0, 28);         // Extra field length
        nameBuffer.copy(localHeader, 30);

        // Write local header and compressed payload
        writeStream.write(localHeader);
        writeStream.write(compressedData);

        // Central directory file header (46 bytes + name length)
        const cdHeader = Buffer.alloc(46 + nameBuffer.length);
        cdHeader.writeUInt32LE(0x02014b50, 0); // Central directory header signature
        cdHeader.writeUInt16LE(20, 4);         // Version made by
        cdHeader.writeUInt16LE(20, 6);         // Version needed
        cdHeader.writeUInt16LE(0x0800, 8);     // Bit flag (UTF-8)
        cdHeader.writeUInt16LE(8, 10);         // Compression method: Deflate
        cdHeader.writeUInt16LE(dosTime, 12);   // Last mod time
        cdHeader.writeUInt16LE(dosDate, 14);   // Last mod date
        cdHeader.writeUInt32LE(crc, 16);       // CRC-32
        cdHeader.writeUInt32LE(compressedSize, 20);   // Compressed size
        cdHeader.writeUInt32LE(uncompressedSize, 24); // Uncompressed size
        cdHeader.writeUInt16LE(nameBuffer.length, 28); // File name length
        cdHeader.writeUInt16LE(0, 30);         // Extra field length
        cdHeader.writeUInt16LE(0, 32);         // File comment length
        cdHeader.writeUInt16LE(0, 34);         // Disk number start
        cdHeader.writeUInt16LE(0, 36);         // Internal file attributes
        cdHeader.writeUInt32LE(0, 38);         // External file attributes
        cdHeader.writeUInt32LE(currentOffset, 42); // Relative offset of local header
        nameBuffer.copy(cdHeader, 46);

        centralDirectoryHeaders.push(cdHeader);
        currentOffset += localHeader.length + compressedData.length;
    }

    // Write all Central Directory headers
    const centralDirectoryOffset = currentOffset;
    let centralDirectorySize = 0;
    for (const cdHeader of centralDirectoryHeaders) {
        writeStream.write(cdHeader);
        centralDirectorySize += cdHeader.length;
    }

    // End of Central Directory record (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
    eocd.writeUInt16LE(0, 4);          // Number of this disk
    eocd.writeUInt16LE(0, 6);          // Disk where CD starts
    eocd.writeUInt16LE(centralDirectoryHeaders.length, 8);  // Number of CD records on disk
    eocd.writeUInt16LE(centralDirectoryHeaders.length, 10); // Total CD records
    eocd.writeUInt32LE(centralDirectorySize, 12);           // Size of central directory
    eocd.writeUInt32LE(centralDirectoryOffset, 16);         // Offset of start of CD
    eocd.writeUInt16LE(0, 20);         // Comment length

    writeStream.write(eocd);
    writeStream.end();

    await new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
    });

    const stat = fs.statSync(outputZipPath);
    return { compressedBytes: stat.size };
}
