import fs from 'fs';

// Helper to create a minimal valid multi-page PDF with text stream
function createSamplePdf(outputPath) {
  const page1Text = `Chapter 1: Process Management and CPU Scheduling
CPU scheduling is the process by which the operating system decides which process in the ready queue gets the CPU for execution.
The primary objectives of CPU scheduling are:
1. Maximum CPU utilization: Keeping the processor active as much as possible.
2. High Throughput: Number of processes completed per unit time.
3. Minimum Turnaround Time: Interval from process submission to completion.
4. Minimum Waiting Time: Total time spent waiting in the ready queue.
5. Minimum Response Time: Time taken from submission to first response.

Round Robin (RR) Scheduling:
Round Robin is a preemptive scheduling algorithm where each process is assigned a fixed time slice called a time quantum (typically 10 to 100 milliseconds).
If the process does not complete within its time quantum, it is preempted and placed at the back of the ready queue.
Round Robin is particularly suited for time-sharing systems because it guarantees fairness and prevents starvation.`;

  const page2Text = `Chapter 2: Deadlock Handling and Banker's Algorithm
A deadlock occurs when a set of processes are blocked because each process is holding a resource and waiting for another resource held by another process.
Four Coffman conditions must hold simultaneously for a deadlock to occur:
1. Mutual Exclusion: At least one resource must be held in a non-shareable mode.
2. Hold and Wait: A process must be holding at least one resource and waiting to acquire additional resources.
3. No Preemption: Resources cannot be forcibly taken from a process.
4. Circular Wait: A closed loop of processes exists where each process waits for a resource held by the next.

Banker's Algorithm:
Developed by Edsger Dijkstra, the Banker's algorithm is a deadlock avoidance algorithm.
It tests for safety by simulating resource allocation for maximum possible requests, and ensures the system remains in a safe state where a safe execution sequence exists for all processes.`;

  const page3Text = `Chapter 3: Memory Management and Virtual Paging
Virtual memory is a storage allocation technique that provides an idealized abstraction of the storage resources that are actually available on a given machine.
Paging is a memory management scheme that eliminates the need for contiguous allocation of physical memory.
Physical memory is divided into fixed-size blocks called frames, and logical memory is divided into blocks of the same size called pages.
The Page Table maps logical addresses (page numbers) to physical addresses (frame numbers).

Translation Lookaside Buffer (TLB):
The TLB is a high-speed hardware cache used to reduce the time taken to access memory locations in page tables.
If a page number is found in the TLB (TLB Hit), the frame number is immediately available.
If not found (TLB Miss), the page table in main memory must be accessed.`;

  // Construct raw PDF with font Helvetica and 3 page streams
  function escapePdf(text) {
    return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function textToStream(text) {
    const lines = text.split('\n');
    let stream = 'BT /F1 11 Tf 50 720 Td 14 TL\n';
    for (const line of lines) {
      if (line.startsWith('Chapter')) {
        stream += `/F1 14 Tf (${escapePdf(line)}) Tj /F1 11 Tf T*\n`;
      } else {
        stream += `(${escapePdf(line)}) Tj T*\n`;
      }
    }
    stream += 'ET';
    return stream;
  }

  const s1 = textToStream(page1Text);
  const s2 = textToStream(page2Text);
  const s3 = textToStream(page3Text);

  const objects = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>\nendobj');

  // Page 1
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R >>\nendobj');
  objects.push(`4 0 obj\n<< /Length ${Buffer.byteLength(s1)} >>\nstream\n${s1}\nendstream\nendobj`);

  // Page 2
  objects.push('5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 6 0 R >>\nendobj');
  objects.push(`6 0 obj\n<< /Length ${Buffer.byteLength(s2)} >>\nstream\n${s2}\nendstream\nendobj`);

  // Page 3
  objects.push('7 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 8 0 R >>\nendobj');
  objects.push(`8 0 obj\n<< /Length ${Buffer.byteLength(s3)} >>\nstream\n${s3}\nendstream\nendobj`);

  // Font
  objects.push('9 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');

  let pdfContent = '%PDF-1.4\n';
  const xref = [0];

  for (const obj of objects) {
    xref.push(Buffer.byteLength(pdfContent));
    pdfContent += obj + '\n';
  }

  const xrefOffset = Buffer.byteLength(pdfContent);
  pdfContent += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdfContent += String(xref[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdfContent += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n';

  fs.writeFileSync(outputPath, pdfContent, 'binary');
  console.log('Sample PDF created at:', outputPath, 'Bytes:', pdfContent.length);
}

createSamplePdf('sample_os_notes.pdf');
