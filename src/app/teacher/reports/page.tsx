'use client';

import { useState } from 'react';
import { FileText, Download, User, Users, Calendar } from 'lucide-react';
import { getAllStudents, getSessionsByStudent, computeAndUpdateAnalytics, User as UserType, Session } from '@/db/indexeddb';
import { useToast } from '@/components/shared/Toast';

export default function TeacherReports() {
  const { showToast } = useToast();
  const [generating, setGenerating] = useState<string | null>(null);
  const [students, setStudents] = useState<UserType[]>([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [loadingStudents, setLoadingStudents] = useState(false);

  const loadStudents = async () => {
    setLoadingStudents(true);
    const studs = await getAllStudents();
    setStudents(studs);
    setLoadingStudents(false);
  };

  const generateIndividualReport = async () => {
    if (!selectedStudent) { showToast('Please select a student first.', 'error'); return; }
    setGenerating('individual');
    try {
      const [jsPDF, html2canvas] = await Promise.all([
        import('jspdf').then(m => m.jsPDF),
        import('html2canvas').then(m => m.default),
      ]);

      const student = students.find(s => s.id === selectedStudent);
      const sessions = await getSessionsByStudent(selectedStudent);
      const analytics = await computeAndUpdateAnalytics(selectedStudent);
      const completed = sessions.filter(s => s.completed);

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();

      // Header
      doc.setFillColor(27, 58, 140);
      doc.rect(0, 0, W, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.text('ReadStar', 15, 20);
      doc.setFontSize(11);
      doc.text('Individual Student Report', 15, 30);
      doc.setFontSize(10);
      doc.text(new Date().toLocaleDateString(), W - 50, 25);

      // Student Info
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(16);
      doc.text(`${student?.firstName} ${student?.lastName}`, 15, 55);
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Grade ${student?.grade || 'N/A'} · ${student?.email}`, 15, 63);
      doc.text(`Report generated: ${new Date().toLocaleDateString()}`, 15, 70);

      // Stats
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(13);
      doc.text('Performance Summary', 15, 85);
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.text(`Total Sessions: ${analytics.totalSessions}`, 15, 95);
      doc.text(`Average Accuracy: ${Math.round(analytics.averageAccuracy)}%`, 15, 103);
      doc.text(`Average WPM: ${analytics.averageWPM}`, 15, 111);
      doc.text(`Total Words Read: ${analytics.totalWordsRead}`, 15, 119);
      doc.text(`Reading Level: ${analytics.readingLevel}`, 15, 127);

      // Session History
      if (completed.length > 0) {
        doc.setFontSize(13);
        doc.setTextColor(0, 0, 0);
        doc.text('Session History (Last 10)', 15, 145);
        let y = 155;
        completed.slice(0, 10).forEach((s, i) => {
          doc.setFontSize(9);
          doc.setTextColor(60, 60, 60);
          doc.text(`${i + 1}. ${new Date(s.startedAt).toLocaleDateString()} · ${s.difficulty} · ${Math.round(s.averageAccuracy)}% accuracy · ${s.averageWPM} WPM · ${s.starsEarned}★`, 15, y);
          y += 8;
        });
      }

      // Issue Analysis
      if (Object.keys(analytics.issueFrequency).length > 0) {
        doc.setFontSize(13);
        doc.setTextColor(0, 0, 0);
        doc.text('Reading Issues', 15, 240);
        let y = 250;
        Object.entries(analytics.issueFrequency).forEach(([type, count]) => {
          doc.setFontSize(9);
          doc.setTextColor(60, 60, 60);
          doc.text(`• ${type}: ${count} occurrences`, 20, y);
          y += 7;
        });
      }

      doc.save(`readstar-report-${student?.firstName}-${student?.lastName}.pdf`);
      showToast('Individual report downloaded!', 'success');
    } catch (err) {
      showToast('Failed to generate report. Please try again.', 'error');
    } finally {
      setGenerating(null);
    }
  };

  const generateClassReport = async () => {
    setGenerating('class');
    try {
      const { jsPDF } = await import('jspdf');
      const studs = await getAllStudents();
      const allAnalytics = await Promise.all(studs.map(s => computeAndUpdateAnalytics(s.id)));

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();

      doc.setFillColor(34, 160, 107);
      doc.rect(0, 0, W, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.text('ReadStar', 15, 20);
      doc.setFontSize(11);
      doc.text('Class Summary Report', 15, 30);
      doc.setFontSize(10);
      doc.text(new Date().toLocaleDateString(), W - 50, 25);

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(16);
      doc.text('Class Overview', 15, 55);

      const totalSessions = allAnalytics.reduce((a, x) => a + x.totalSessions, 0);
      const avgAccuracy = allAnalytics.length > 0 ? allAnalytics.reduce((a, x) => a + x.averageAccuracy, 0) / allAnalytics.length : 0;

      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.text(`Total Students: ${studs.length}`, 15, 65);
      doc.text(`Total Sessions: ${totalSessions}`, 15, 73);
      doc.text(`Class Average Accuracy: ${Math.round(avgAccuracy)}%`, 15, 81);

      doc.setFontSize(13);
      doc.setTextColor(0, 0, 0);
      doc.text('Student Roster', 15, 100);
      let y = 110;
      studs.forEach((s, i) => {
        const anal = allAnalytics[i];
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        doc.text(`${s.firstName} ${s.lastName} · ${anal.totalSessions} sessions · ${Math.round(anal.averageAccuracy)}% accuracy · ${anal.readingLevel}`, 15, y);
        y += 8;
        if (y > 260) { doc.addPage(); y = 20; }
      });

      doc.save(`readstar-class-report-${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast('Class report downloaded!', 'success');
    } catch {
      showToast('Failed to generate report.', 'error');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto page-enter">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Report Generation</h1>
        <p className="text-gray-500 text-sm mt-0.5">Export PDF reports for students and the class</p>
      </div>

      <div className="space-y-4">
        {/* Individual Report */}
        <div className="bg-white rounded-2xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Individual Student Report</h2>
              <p className="text-gray-500 text-sm mt-0.5">Full performance summary, charts, issue analysis, and session log for one student</p>
            </div>
          </div>
          <div className="flex gap-3">
            <select
              value={selectedStudent}
              onChange={e => setSelectedStudent(e.target.value)}
              onFocus={loadStudents}
              className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A8C]/30 bg-white"
            >
              <option value="">Select a student...</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.firstName} {s.lastName} (Grade {s.grade})</option>
              ))}
            </select>
            <button
              onClick={generateIndividualReport}
              disabled={generating === 'individual' || !selectedStudent}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1B3A8C] text-white text-sm font-medium disabled:opacity-50 hover:bg-blue-900 transition-colors"
            >
              <Download className="w-4 h-4" />
              {generating === 'individual' ? 'Generating...' : 'Download PDF'}
            </button>
          </div>
        </div>

        {/* Class Report */}
        <div className="bg-white rounded-2xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <Users className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Class Summary Report</h2>
              <p className="text-gray-500 text-sm mt-0.5">Aggregate class stats, all student performance, and at-risk student list</p>
            </div>
          </div>
          <button
            onClick={generateClassReport}
            disabled={generating === 'class'}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#22A06B] text-white text-sm font-medium disabled:opacity-50 hover:bg-emerald-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            {generating === 'class' ? 'Generating...' : 'Download Class PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
