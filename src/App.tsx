/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Upload, FileAudio, FileVideo, Loader2, Copy, Check, Info, Trash2, AudioLines, Download, Edit2 } from 'lucide-react';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import * as htmlToImage from 'html-to-image';

const getSystemPrompt = (teacherName: string, studentName: string) => `You are ${teacherName}, a joyful, world-class, deeply empathetic ESL (English as a Second Language) teacher evaluating your Vietnamese student's speaking homework. Your specialty is incredibly precise, constructive, and uplifting feedback that highlights nuances in grammar, pronunciation, and pragmatics while ensuring the student feels proud of their effort. You MUST act exactly as a human teacher. Do NEVER mention you are an AI, a language model, or an automated assistant. Be completely in character as ${teacherName}.

Analyze the provided speech submission carefully.

CRITICAL INSTRUCTIONS:
- FIRST, you MUST output the exact transcription of the student's speech wrapped in <transcript> tags (e.g. <transcript>Hello everyone...</transcript>).
- THEN, output the evaluation using EXACTLY the HTML format below. DO NOT output Markdown outside of the transcript. It must be valid HTML table matching this exact structure!
- VERY IMPORTANT: Do NOT wrap your output in \`\`\`html code blocks. Output the raw HTML immediately after the </transcript> tag.
- Carefully evaluate grammar (especially pronouns, tenses, subject-verb agreement, and articles). Provide the highest standard of grammatical corrections.
- Do your best to assess pronunciation from the transcript or audio provided.
- Write the notes entirely in Vietnamese (except for the exact English words being corrected).

OUTPUT FORMAT:
Output the following exact HTML structure, filling in the bracketed info. Replace [đạt / cần cải thiện] with "đạt", "cần cải thiện", or "chưa đạt", matching the class class name respectively ("badge-dat", "badge-can-cai-thien", "badge-chua-dat").

<transcript>
[Insert the exact English transcript of the student's speech here]
</transcript>

<table class="excel-table">
  <thead>
    <tr>
      <th colspan="3" class="header-blue">SPEAKING VIDEO FEEDBACK FORM</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="bold-col">Student Name (tên học sinh):</td>
      <td colspan="2" class="value-col"><div>${studentName || '[Insert Name]'}</div></td>
    </tr>
    <tr>
      <td class="bold-col">Speaking Topic (chủ đề nói):</td>
      <td colspan="2" class="value-col"><div>[Insert inferred topic]</div></td>
    </tr>
    <tr>
      <th colspan="3" class="header-yellow">CRITERIA</th>
    </tr>
    <tr>
      <th class="criteria-col" style="width: 25%;"></th>
      <th class="result-col" style="width: 20%;">Kết quả</th>
      <th class="notes-col" style="width: 55%;">notes</th>
    </tr>
    <tr>
      <td class="criteria-col"><b>TOPIC</b><br/>(Chủ đề)</td>
      <td class="result-col"><span class="badge-[dat or can-cai-thien]">[đạt / cần cải thiện]</span></td>
      <td class="notes-col">[1 sentence about how well they expanded their ideas]</td>
    </tr>
    <tr>
      <td class="criteria-col"><b>PRONUNCIATION</b><br/>(Phát âm)</td>
      <td class="result-col"><span class="badge-[dat or can-cai-thien]">[đạt / cần cải thiện]</span></td>
      <td class="notes-col">
        * Em cần lưu ý 1 số từ khi phát âm:<br/>
        - <span style="color:red">[Word]</span> ([phonetics]): [explanation].<br/>
      </td>
    </tr>
    <tr>
      <td class="criteria-col"><b>FLUENCY</b><br/>(Độ trôi chảy)</td>
      <td class="result-col"><span class="badge-[dat or can-cai-thien]">[đạt / cần cải thiện]</span></td>
      <td class="notes-col">[Specific tip on intonation, pausing, or linking words in Vietnamese]</td>
    </tr>
    <tr>
      <td class="criteria-col"><b>SENTENCE STRUCTURE</b><br/>(Diễn đạt câu)</td>
      <td class="result-col"><span class="badge-[dat or can-cai-thien]">[đạt / cần cải thiện]</span></td>
      <td class="notes-col">
        - [Original incorrect sentence] -> <span style="color:red">[Corrected word/part]</span> [rest of sentence].<br/>
      </td>
    </tr>
    <tr>
      <td class="criteria-col"><b>CONFIDENCE</b><br/>(Tự tin)</td>
      <td class="result-col"><span class="badge-[dat or can-cai-thien]">[đạt / cần cải thiện]</span></td>
      <td class="notes-col">[Uplifting closing sentence praising their courage]</td>
    </tr>
  </tbody>
</table>
`;

const getLoadingStates = (teacherName: string) => [
  "Listening carefully to the student...",
  "Taking notes on pronunciation...",
  "Finding the best ways to improve...",
  "Writing down encouraging feedback...",
  `Adding ${teacherName}'s magical touch ✨`
];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [studentTranscript, setStudentTranscript] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // New states for names
  const [teacherName, setTeacherName] = useState(() => {
    return localStorage.getItem('teacherName') || 'Miss Ha';
  });
  const [isEditingTeacher, setIsEditingTeacher] = useState(false);
  const [studentName, setStudentName] = useState('');
  
  const [isDownloading, setIsDownloading] = useState(false);
  const markdownContainerRef = useRef<HTMLDivElement>(null);
  
  // To use Groq, the developer can add VITE_GROQ_API_KEY to AI Studio secrets.
  // Otherwise, it seamlessly falls back to the built-in Gemini API.
  const groqKey = (import.meta as any).env?.VITE_GROQ_API_KEY || '';
  const aiProvider = groqKey ? 'groq' : 'gemini';

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating) {
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev < getLoadingStates(teacherName).length - 1 ? prev + 1 : prev));
      }, 4000); // Progress the loading text every 4 seconds
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(interval);
  }, [isGenerating, teacherName]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setFeedback(null);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.webm'],
      'audio/*': ['.mp3', '.wav', '.m4a']
    },
    maxSize: 24 * 1024 * 1024, // 24MB limit (Groq API max is 25MB)
    onDropRejected: (fileRejections) => {
      if (fileRejections[0]?.errors[0]?.code === 'file-too-large') {
        setError('File is too large. Please upload an audio/video clip under 24MB.');
      } else {
        setError('Invalid file format. Please upload video or audio.');
      }
    }
  });

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
    setFeedback(null);
    setError(null);
    setStudentTranscript(null);
  };

  const processAIOutput = (text: string) => {
    // 1. Extract transcript
    const transcriptMatch = text.match(/<transcript>([\s\S]*?)<\/transcript>/i);
    if (transcriptMatch) {
      setStudentTranscript(transcriptMatch[1].trim());
    }
    
    // 2. Clean feedback HTML
    let cleaned = text.replace(/<transcript>[\s\S]*?<\/transcript>/i, '').trim();
    // Remove markdown code blocks if the AI accidentally wrapped it
    cleaned = cleaned.replace(/^```(html|xml)?\s*/i, '').replace(/```$/i, '').trim();
    
    return cleaned;
  };

  const generateFeedbackGemini = async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const filePart = await new Promise<any>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          const base64 = (reader.result as string).split(',')[1];
          resolve({
            inlineData: {
              data: base64,
              mimeType: file!.type
            }
          });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file!);
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [
        { role: 'user', parts: [filePart, { text: getSystemPrompt(teacherName, studentName) }] }
      ]
    });

    return processAIOutput(response.text || '');
  };

  const generateFeedbackGroq = async () => {
    if (!groqKey) {
      throw new Error("Groq API Key is missing. Please add it in Settings.");
    }
    
    // Step 1: Transcribe using Whisper on Groq
    const formData = new FormData();
    formData.append('file', file!);
    formData.append('model', 'whisper-large-v3');
    
    const transcribeRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`
      },
      body: formData
    });
    
    if (!transcribeRes.ok) {
      const errData = await transcribeRes.json();
      throw new Error(errData.error?.message || 'Transcription failed');
    }
    
    const transcribeData = await transcribeRes.json();
    const transcript = transcribeData.text;
    setStudentTranscript(transcript);
    
    // Step 2: Evaluate using Llama 3 on Groq
    const evalRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: getSystemPrompt(teacherName, studentName) },
          { role: 'user', content: `Here is the student's speaking transcript to evaluate: "${transcript}"\n\n(Remember to output the <transcript> block first!)` }
        ]
      })
    });
    
    if (!evalRes.ok) {
      const errData = await evalRes.json();
      throw new Error(errData.error?.message || 'Evaluation failed');
    }
    
    const evalData = await evalRes.json();
    const text = evalData.choices[0].message.content;
    return processAIOutput(text);
  };

  const handleDownloadImage = async () => {
    if (!markdownContainerRef.current) return;
    try {
      setIsDownloading(true);
      setError(null);
      
      // Wait for any animations to finish painting
      await new Promise(r => setTimeout(r, 400));
      
      const node = markdownContainerRef.current;
      
      // Safari specific fix: render once to prime the cache (fixes blank SVG/images/fonts)
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      if (isSafari) {
        await htmlToImage.toPng(node, { cacheBust: true, pixelRatio: 1 });
      }
      
      const width = node.scrollWidth;
      const height = node.scrollHeight;
      
      const dataUrl = await htmlToImage.toPng(node, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        width: width,
        height: height,
        style: { 
          margin: '0', 
          borderRadius: '0',
          border: 'none',
          boxShadow: 'none',
          width: `${width}px`,
          height: `${height}px`,
        },
        cacheBust: true,
      });
      
      const link = document.createElement('a');
      link.download = `${studentName || 'student'}-feedback.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (err) {
      console.error("Failed to download image: ", err);
      setError("Failed to generate image (possibly due to browser restrictions). Please use the Copy button instead.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopy = async () => {
    if (!feedback) return;
    try {
      if (markdownContainerRef.current && navigator.clipboard && window.ClipboardItem) {
        // Rich text HTML copy for Word/Google Docs
        const html = `<div style="font-family: 'Times New Roman', Times, serif; font-size: 15px; color: black; background: white;">${markdownContainerRef.current.innerHTML}</div>`;
        const blobHtml = new Blob([html], { type: 'text/html' });
        const blobText = new Blob([feedback], { type: 'text/plain' });
        
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': blobHtml,
            'text/plain': blobText
          })
        ]);
      } else {
        // Fallback for older browsers
        await navigator.clipboard.writeText(feedback);
      }
      
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      // Secondary fallback
      try {
        await navigator.clipboard.writeText(feedback);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {
        setError("Could not access clipboard. Please select the table and copy it manually.");
      }
    }
  };

  const generateFeedback = async () => {
    if (!file) return;
    setIsGenerating(true);
    setError(null);
    setFeedback(null);
    setStudentTranscript(null);
    setLoadingStep(0);

    try {
      let resultText = '';
      if (aiProvider === 'gemini') {
        resultText = await generateFeedbackGemini();
      } else {
        resultText = await generateFeedbackGroq();
      }
      setFeedback(resultText);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while generating feedback.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-rose-50/40 font-sans p-6 md:p-8 flex flex-col max-w-[1440px] mx-auto selection:bg-rose-200">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-10 border-b border-rose-200/60 pb-6 gap-4">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 bg-gradient-to-br from-rose-400 to-orange-400 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transform -rotate-3 cursor-default">
            <span className="text-3xl">👩‍🏫</span>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-rose-950 tracking-tight flex items-center gap-2">
              {teacherName}'s Feedback Studio <span className="text-2xl">✨</span>
            </h1>
            <p className="text-sm text-rose-600/80 uppercase tracking-widest font-bold mt-1 flex items-center gap-2">
              Empowering English Learners
              <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded text-[10px] lowercase">{aiProvider} engine</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white pr-4 pl-1.5 py-1.5 rounded-full shadow-sm border border-rose-100 transition-all">
             <div className="w-10 h-10 rounded-full bg-rose-200 flex items-center justify-center text-rose-700 font-bold text-sm tracking-tighter border-2 border-white shrink-0">
               {teacherName ? teacherName.substring(0, 2).toUpperCase() : 'T'}
             </div>
             {isEditingTeacher ? (
               <input 
                 autoFocus
                 type="text" 
                 value={teacherName} 
                 onChange={(e) => setTeacherName(e.target.value)} 
                 onBlur={() => {
                   setIsEditingTeacher(false);
                   localStorage.setItem('teacherName', teacherName);
                 }}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') {
                     setIsEditingTeacher(false);
                     localStorage.setItem('teacherName', teacherName);
                   }
                 }}
                 className="text-sm font-bold text-rose-800 bg-rose-50 border-none outline-none w-24 px-2 py-1 rounded"
               />
             ) : (
               <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setIsEditingTeacher(true)}>
                 <span className="text-sm font-bold text-rose-800">{teacherName}</span>
                 <Edit2 className="w-3 h-3 text-rose-300 group-hover:text-rose-500" />
               </div>
             )}
          </div>
        </div>
      </header>

      <main className="flex flex-col md:flex-row gap-8 flex-1">
        
        {/* Left Column - Input Panel */}
        <div className="w-full md:w-1/3 flex flex-col gap-6">

          <div className="bg-white rounded-3xl p-6 shadow-xl shadow-rose-100/40 border border-rose-100 flex flex-col h-fit relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-bl-[100px] -z-10 opacity-60"></div>
            <label className="text-xs font-extrabold text-rose-400 uppercase mb-2 block tracking-wider">New Submission</label>
            <h2 className="text-2xl font-bold text-rose-950 mb-6">Let's review a student! 🎈</h2>
            
            <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-rose-800">Student Video/Audio</span>
                <span className="text-[10px] font-bold text-rose-400">Max 24MB</span>
              </div>
              <div 
                {...getRootProps()} 
                className={cn(
                  "h-32 w-full rounded-xl flex flex-col items-center justify-center border-2 border-dashed transition-all cursor-pointer",
                  isDragActive ? "border-rose-400 bg-white scale-[1.02]" : "border-rose-200 bg-white hover:border-rose-300",
                  file && "border-solid border-rose-300 bg-white"
                )}
              >
                <input {...getInputProps()} />
                
                <AnimatePresence mode="wait">
                  {!file ? (
                    <motion.div 
                      key="upload"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center text-center gap-2 w-full"
                    >
                      <svg className="w-8 h-8 text-rose-300" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path><path fillRule="evenodd" d="M10 8a2 2 0 100 4 2 2 0 000-4z" clipRule="evenodd"></path></svg>
                      <div className="text-xs text-slate-500 px-4">
                        <span className="font-bold text-rose-600">Click to upload</span> or drag<br/>
                        <span className="opacity-70 text-[10px]">MP4, WEBM, MP3, M4A</span>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="file"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center justify-center text-center gap-2 w-full px-4 relative"
                    >
                      {file.type.startsWith('video') ? (
                        <FileVideo className="w-8 h-8 text-blue-400" />
                      ) : (
                        <FileAudio className="w-8 h-8 text-blue-400" />
                      )}
                      <button 
                        onClick={clearFile}
                        className="absolute -top-6 -right-2 p-1 bg-slate-800 rounded-full border border-slate-600 text-slate-400 hover:text-red-400 transition-colors"
                        title="Remove file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="w-full">
                        <p className="text-xs font-medium text-slate-200 truncate" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-bold text-rose-800 mb-1 block">Student Name (Optional)</label>
              <input 
                type="text" 
                placeholder="e.g., Nguyen Van A"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-rose-100 bg-white shadow-sm focus:outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 transition-all text-slate-800 placeholder:text-slate-300"
              />
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-xl flex items-start gap-2 text-left border border-red-100">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); generateFeedback(); }}
              disabled={!file || isGenerating}
              className={cn(
                "mt-6 w-full py-4 px-4 rounded-2xl font-bold text-[15px] shadow-lg transition-all flex justify-center items-center gap-3 overflow-hidden",
                !file 
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none" 
                  : isGenerating 
                    ? "bg-rose-500 text-white shadow-rose-200 cursor-wait"
                    : "bg-gradient-to-r from-rose-500 to-orange-400 hover:from-rose-600 hover:to-orange-500 text-white shadow-rose-300/50 hover:shadow-rose-400/50 active:scale-[0.98]"
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <AnimatePresence mode="popLayout">
                    <motion.span
                      key={loadingStep}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="font-medium inline-block text-left relative overflow-hidden"
                    >
                      {getLoadingStates(teacherName)[loadingStep]}
                    </motion.span>
                  </AnimatePresence>
                </>
              ) : (
                "Generate Feedback ✨"
              )}
            </button>
          </div>
        </div>

        {/* Right Column - Results Panel */}
        <div className="w-full md:w-2/3 flex flex-col gap-6 h-full min-h-[500px]">
          <AnimatePresence>
            {studentTranscript && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl shadow-sm border border-rose-100 p-6 flex flex-col"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                     <AudioLines className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-rose-950">Transcription</h3>
                </div>
                <div className="p-5 bg-rose-50/50 border border-rose-100/50 rounded-2xl text-slate-700 text-[15px] leading-relaxed font-medium italic">
                  "{studentTranscript}"
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {feedback ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-3xl shadow-xl shadow-rose-100/40 border border-rose-100 h-full flex flex-col overflow-hidden relative"
            >
              <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-amber-50 to-rose-50 rounded-bl-[100px] -z-10 opacity-60"></div>
              <div className="p-6 md:p-8 border-b border-rose-50 flex justify-between items-center bg-transparent">
                <h3 className="font-extrabold text-2xl text-rose-950 flex items-center gap-3">
                  Feedback Ready! 💌
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadImage}
                    disabled={isDownloading}
                    className="px-4 py-2 rounded-xl transition-colors flex items-center gap-2 text-xs font-bold bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {isDownloading ? "Saving..." : "Download Image"}
                  </button>
                  <button
                    onClick={handleCopy}
                    className={cn(
                      "px-4 py-2 rounded-xl transition-colors flex items-center gap-2 text-xs font-bold",
                      copied 
                        ? "bg-green-100 text-green-700 border border-green-200" 
                        : "bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 shadow-sm"
                    )}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copied" : "Copy for Word/Docs"}
                  </button>
                </div>
              </div>
              <div className="p-4 md:p-6 overflow-auto w-full max-w-none flex-1 bg-rose-50/20">
                <div 
                  ref={markdownContainerRef} 
                  className="markdown-body bg-white rounded-xl shadow-sm border border-rose-100/50 p-6 md:p-8 min-w-[900px] mx-auto overflow-hidden"
                >
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                  >
                    {feedback}
                  </ReactMarkdown>
                </div>
              </div>
            </motion.div>
          ) : (
             <div className="bg-white border-2 border-rose-100 border-dashed rounded-3xl h-full min-h-[500px] flex flex-col items-center justify-center text-rose-400 space-y-6 shadow-sm p-8 text-center bg-rose-50/30">
                <div className="w-24 h-24 rounded-[2rem] bg-rose-100/60 flex items-center justify-center mb-2 transform -rotate-12">
                   <span className="text-5xl">💌</span>
                </div>
                <div>
                  <h3 className="font-bold text-rose-900 mb-2 text-xl">Ready when you are!</h3>
                  <p className="text-[15px] max-w-sm text-rose-600/70 leading-relaxed font-medium">Upload a video or audio clip and select "Generate Feedback ✨" to create some magic for your student.</p>
                </div>
             </div>
          )}
        </div>

      </main>
    </div>
  );
}
