CIVIL MASTER ERP - Integrated Timesheet Build

Upload all files to the SAME Vercel/Netlify/GitHub folder.
Open index.html.

Main flow:
1) Employee codes are maintained in Employee Management / Sub Contractor Employees.
2) Open timesheet.html -> Upload Timesheet.
3) Upload horizontal Excel/CSV with Employee Code + day columns 1-31.
4) Company employees are routed automatically to payroll localStorage.
5) Sub Contractor employees appear in Central Register and Sub Contractor reports.
6) Full Timesheet Register combines all uploaded batches.

Important: This is the current browser/localStorage prototype architecture. Keep all files on the same domain.
