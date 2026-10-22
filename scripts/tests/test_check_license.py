# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Test của scripts/check-license.sh và add-license-header.sh (#47, D-010): tệp thiếu header hoặc
còn Apache-2.0 bị bắt, `make license` thêm đúng header GPL-3.0-or-later. Mỗi test dựng một repo git
tạm chứa bản sao 3 script. Chạy: make check (job CI `make-check`), chỉ thư viện chuẩn."""
# REUSE-IgnoreStart (chuỗi header mẫu trong test, không phải header của tệp này)
import os
import shutil
import subprocess
import tempfile
import unittest

GOC = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SCRIPT = ("lib-spdx.sh", "check-license.sh", "add-license-header.sh")
DUNG = "# SPDX-FileCopyrightText: 2026 DTU_DZ_2\n# SPDX-License-Identifier: GPL-3.0-or-later\n"


class KiemGiayPhep(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.mkdtemp()
        os.mkdir(os.path.join(self.td, "scripts"))
        for s in SCRIPT:
            shutil.copy(os.path.join(GOC, "scripts", s), os.path.join(self.td, "scripts", s))
        subprocess.run(["git", "init", "-q", self.td], check=True)

    def tearDown(self):
        shutil.rmtree(self.td)

    def ghi(self, ten, noi_dung):
        duong = os.path.join(self.td, ten)
        os.makedirs(os.path.dirname(duong), exist_ok=True)
        with open(duong, "w", encoding="utf-8") as f:
            f.write(noi_dung)

    def doc(self, ten):
        with open(os.path.join(self.td, ten), encoding="utf-8") as f:
            return f.read()

    def chay(self, script):
        return subprocess.run(["bash", os.path.join(self.td, "scripts", script)],
                              capture_output=True, text=True)

    def test_repo_that_dat(self):
        kq = subprocess.run(["bash", os.path.join(GOC, "scripts", "check-license.sh")],
                            capture_output=True, text=True)
        self.assertEqual(kq.returncode, 0, kq.stdout + kq.stderr)

    def test_header_dung_dat(self):
        self.ghi("a.py", DUNG + "print(1)\n")
        self.ghi("b.sql", "-- SPDX-FileCopyrightText: 2026 DTU_DZ_2\n-- SPDX-License-Identifier: GPL-3.0-or-later\n")
        self.ghi("c.bpmn20.xml", '<?xml version="1.0"?>\n<!-- SPDX-FileCopyrightText: 2026 DTU_DZ_2 -->\n'
                                 "<!-- SPDX-License-Identifier: GPL-3.0-or-later -->\n<a/>\n")
        kq = self.chay("check-license.sh")
        self.assertEqual(kq.returncode, 0, kq.stdout)

    def test_thieu_header_bi_bat(self):
        self.ghi("a.py", "print(1)\n")
        kq = self.chay("check-license.sh")
        self.assertEqual(kq.returncode, 1)
        self.assertIn("Thiếu header SPDX", kq.stdout)
        self.assertIn("a.py", kq.stdout)

    def test_con_apache_bi_bat(self):
        self.ghi("a.yml", "# SPDX-FileCopyrightText: 2026 DTU_DZ_2\n# SPDX-License-Identifier: Apache-2.0\n")
        kq = self.chay("check-license.sh")
        self.assertEqual(kq.returncode, 1)
        self.assertIn("a.yml: SPDX-License-Identifier: Apache-2.0", kq.stdout)

    def test_md_co_header_sai_bi_bat(self):
        # .md không bắt buộc header, nhưng có thì phải đúng giấy phép.
        self.ghi("doc.md", "<!-- SPDX-License-Identifier: Apache-2.0 -->\n# Tài liệu\n")
        self.ghi("khong-header.md", "# Không header\n")
        kq = self.chay("check-license.sh")
        self.assertEqual(kq.returncode, 1)
        self.assertIn("doc.md", kq.stdout)
        self.assertNotIn("khong-header.md", kq.stdout)

    def test_thieu_ban_quyen_bi_bat(self):
        self.ghi("a.sh", "#!/bin/sh\n# SPDX-License-Identifier: GPL-3.0-or-later\n")
        self.assertEqual(self.chay("check-license.sh").returncode, 1)

    def test_gpl2_hay_giay_phep_ghep_bi_bat(self):
        self.ghi("a.py", "# SPDX-FileCopyrightText: 2026 DTU_DZ_2\n# SPDX-License-Identifier: GPL-3.0-only\n")
        self.ghi("b.py", "# SPDX-FileCopyrightText: 2026 DTU_DZ_2\n# SPDX-License-Identifier: GPL-3.0-or-later\n"
                         "# SPDX-License-Identifier: Apache-2.0\n")
        kq = self.chay("check-license.sh")
        self.assertEqual(kq.returncode, 1)
        self.assertIn("a.py", kq.stdout)
        self.assertIn("b.py", kq.stdout)

    def test_make_license_them_header_dung(self):
        self.ghi("x/a.sh", "#!/usr/bin/env bash\necho hi\n")
        self.ghi("x/b.sql", "select 1;\n")
        self.ghi("x/c.xml", '<?xml version="1.0"?>\n<a/>\n')
        self.ghi("x/d.ts", "export {}\n")
        self.ghi("x/e.css", "a {}\n")
        self.assertEqual(self.chay("add-license-header.sh").returncode, 0)
        self.assertEqual(self.doc("x/a.sh"), "#!/usr/bin/env bash\n" + DUNG + "echo hi\n")
        self.assertTrue(self.doc("x/b.sql").startswith("-- SPDX-FileCopyrightText: 2026 DTU_DZ_2\n"
                                                       "-- SPDX-License-Identifier: GPL-3.0-or-later\n"))
        self.assertIn("<!-- SPDX-License-Identifier: GPL-3.0-or-later -->", self.doc("x/c.xml").splitlines()[2])
        self.assertTrue(self.doc("x/d.ts").startswith("// SPDX-FileCopyrightText"))
        self.assertTrue(self.doc("x/e.css").startswith("/* SPDX-FileCopyrightText: 2026 DTU_DZ_2 */\n"))
        kq = self.chay("check-license.sh")
        self.assertEqual(kq.returncode, 0, kq.stdout)

    def test_make_license_khong_sua_header_sai(self):
        cu = "# SPDX-License-Identifier: Apache-2.0\nx = 1\n"
        self.ghi("a.py", cu)
        self.chay("add-license-header.sh")
        self.assertEqual(self.doc("a.py"), cu)


if __name__ == "__main__":
    unittest.main()
# REUSE-IgnoreEnd
