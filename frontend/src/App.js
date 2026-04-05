import bgImage from "./assets/bg.jpg";
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import jsPDF from "jspdf";

function App() {
  const APP_TITLE = "InterviewAI Pro - AI Interview Assistant";
  const BASE_URL = "http://127.0.0.1:5000";

  const [isLogin, setIsLogin] = useState(true);
  const [user, setUser] = useState({ name: "", email: "", password: "" });
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  const [resume, setResume] = useState(null);
  const [fileName, setFileName] = useState("");
  const [questions, setQuestions] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [answers, setAnswers] = useState({});
  const [feedback, setFeedback] = useState({});
  const [performance, setPerformance] = useState(null);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isFileProcessing, setIsFileProcessing] = useState(false);

  const btn = { padding: "12px", borderRadius: "8px", border: "none", background: "#667eea", color: "white", cursor: "pointer", flex: 1 };
  const inputStyle = { width: "100%", padding: "10px", margin: "8px 0", borderRadius: "6px", border: "1px solid #ccc" };

  const handleAuth = async () => {
    try {
      setLoading(true);
      const url = isLogin ? `${BASE_URL}/login` : `${BASE_URL}/signup`;
      const res = await axios.post(url, user);
      if (isLogin) setToken(res.data.token);
      else {
        alert("Signup successful! Please login.");
        setIsLogin(true);
      }
      setLoading(false);
    } catch (err) {
      setLoading(false);
      alert(err.response?.data?.msg || "Authentication Error");
    }
  };

  const logout = () => {
    setToken("");
    setResume(null);
    setFileName("");
    setQuestions([]);
    setAnalysis(null);
    setAnswers({});
    setFeedback({});
    setPerformance(null);
  };

  const authHeader = { headers: { Authorization: `Bearer ${token}` } };

  const startVoiceInput = (i) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Please use Google Chrome for voice input.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setAnswers((prev) => ({ ...prev, [i]: text }));
    };
    recognition.start();
  };

  const generateQuestions = async () => {
    if (!resume) return alert("Please upload a resume first");

    const formData = new FormData();
    formData.append("resume", resume);

    try {
      const res = await axios.post(`${BASE_URL}/questions`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = res.data;

      if (data.msg) {
        return alert(`Server Error: ${data.msg}`);
      }

      if (data.questions && Array.isArray(data.questions)) {
        setQuestions(data.questions);
      } else if (Array.isArray(data)) {
        setQuestions(data);
      } else if (typeof data === "string") {
        setQuestions(data.split("\n").map(q => q.trim()).filter(q => q.length > 5));
      } else {
        setQuestions([]);
        alert("No questions were returned. Try again.");
      }
    } catch (err) {
      const msg = err.response?.data?.msg || err.message || "Failed to generate questions.";
      alert(`Error: ${msg}`);
    }
  };

  const analyzeResume = async () => {
    if (!resume) return alert("Please upload a resume first");

    const formData = new FormData();
    formData.append("resume", resume);

    try {
      const res = await axios.post(`${BASE_URL}/analyze-resume`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = res.data;

      if (data.msg) {
        return alert(`Server Error: ${data.msg}`);
      }

      setAnalysis({
        score: data.score || "N/A",
        skills: data.skills || "Not detected",
        jobs: data.jobs || "Not detected",
        weak: data.weakAreas || "Not detected",
        suggestions: data.suggestions || "Try uploading a clearer resume"
      });

    } catch (err) {
      const msg = err.response?.data?.msg || err.message || "Resume analysis failed.";
      alert(`Error: ${msg}`);
    }
  };

  const analyzePerformance = () => {
    const scores = Object.values(feedback).map(f => {
      const match = (typeof f === "string" ? f : f?.feedback || "").match(/Score:\s*(\d+)/i);
      return match ? parseInt(match[1]) : 0;
    });

    if (scores.length === 0) return alert("No answers evaluated yet! Answer some questions and evaluate them first.");

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    setPerformance(avg.toFixed(2));
  };

  const evaluateAnswer = async (i) => {
    if (!answers[i] || answers[i].trim() === "") {
      return alert("Please write or speak an answer before evaluating.");
    }
    try {
      const res = await axios.post(`${BASE_URL}/test`, { answer: answers[i] }, authHeader);
      const data = res.data;
      const feedbackText = data.feedback || (typeof data === "string" ? data : "No feedback received.");
      setFeedback((prev) => ({ ...prev, [i]: feedbackText }));
    } catch (err) {
      const msg = err.response?.data?.msg || err.message || "Evaluation failed.";
      alert(`Error: ${msg}`);
    }
  };

  const sendMessage = async () => {
    if (!chatInput.trim()) return;

    try {
      const res = await axios.post(
        `${BASE_URL}/chat`,
        { message: chatInput },
        authHeader
      );

      setChat((prev) => [
        ...prev,
        { user: chatInput, bot: res.data.reply }
      ]);

      setChatInput("");
    } catch (err) {
      alert("Chat failed");
    }
  };

  const downloadReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("InterviewAI Pro - Report", 20, 20);
    doc.setFontSize(12);

    if (analysis) {
      doc.text("Resume Analysis", 20, 35);
      doc.text(`ATS Score: ${analysis.score}`, 20, 45);
      doc.text(`Skills: ${analysis.skills}`, 20, 55);
      doc.text(`Jobs: ${analysis.jobs}`, 20, 65);
      doc.text(`Weak Areas: ${analysis.weak}`, 20, 75);
      doc.text(`Suggestions: ${analysis.suggestions}`, 20, 85);
    }

    if (performance) {
      doc.text(`Overall Performance Score: ${performance}/10`, 20, 100);
    }

    if (Object.keys(feedback).length > 0) {
      doc.text("Answer Feedback:", 20, 115);
      let y = 125;
      Object.entries(feedback).forEach(([i, f]) => {
        const text = typeof f === "string" ? f : f?.feedback || "";
        doc.text(`Q${parseInt(i) + 1}: ${text.substring(0, 80)}`, 20, y);
        y += 10;
      });
    }

    doc.save("InterviewAI_Report.pdf");
  };

  const handleFileProcess = (file) => {
    if (!file) return;
    setIsFileProcessing(true);
    setFileName(file.name);
    setTimeout(() => {
      setResume(file);
      setIsFileProcessing(false);
    }, 800);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!isFileProcessing && !resume) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (!isFileProcessing && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const removeFile = (e) => {
    e.stopPropagation();
    setResume(null);
    setFileName("");
    setQuestions([]);
    setAnalysis(null);
    setAnswers({});
    setFeedback({});
    setPerformance(null);
  };

  const chartData = Object.entries(feedback).map(([i, f]) => {
    const text = typeof f === "string" ? f : f?.feedback || "";
    const match = text.match(/Score:\s*(\d+)/i);
    return {
      name: `Q${parseInt(i) + 1}`,
      score: match ? parseInt(match[1]) : 0
    };
  });

  if (loading) return <h2 style={{ textAlign: "center", marginTop: "40vh" }}>Loading...</h2>;

  if (!token) {
    return (
      <div style={{ minHeight: "100vh", backgroundImage: `url(${bgImage})`, backgroundSize: "cover", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", position: "relative" }}>
        <h1 style={{ color: "black", textShadow: "0 2px 8px rgba(0, 0, 0, 0.31)", marginBottom: "20px" }}>{APP_TITLE}</h1>
        <div style={{ background: "rgba(255,255,255,0.95)", padding: "30px", borderRadius: "15px", width: "320px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
          <h3 style={{ textAlign: "center", marginTop: 0 }}>{isLogin ? "Login" : "Signup"}</h3>
          {!isLogin && <input style={inputStyle} placeholder="Name" value={user.name} onChange={(e) => setUser({ ...user, name: e.target.value })} />}
          <input style={inputStyle} placeholder="Email" value={user.email} onChange={(e) => setUser({ ...user, email: e.target.value })} />
          <input style={inputStyle} type="password" placeholder="Password" value={user.password} onChange={(e) => setUser({ ...user, password: e.target.value })} />
          <button style={{ ...btn, width: "100%", marginTop: "10px" }} onClick={handleAuth}>{isLogin ? "Login" : "Signup"}</button>
          <p onClick={() => setIsLogin(!isLogin)} style={{ cursor: "pointer", textAlign: "center", color: "#667eea", marginBottom: 0 }}>
            Switch to {isLogin ? "Signup" : "Login"}
          </p>
        </div>
        <p style={{ position: "absolute", bottom: "10px", right: "15px", fontSize: "12px", color: "black", opacity: 0.7 }}>Created by Tanmay</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", backgroundImage: `url(${bgImage})`, backgroundSize: "cover", position: "relative" }}>
      <div style={{ width: "90%", maxWidth: "850px", margin: "0 auto", paddingTop: "20px", display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
        <h2 style={{ textAlign: "center", width: "100%", margin: 0, color: "black", textShadow: "0 2px 6px rgba(0,0,0,0.4)" }}>{APP_TITLE}</h2>
        <button onClick={logout} style={{ position: "fixed", right: "20px", top: "20px", background: "#ff4d4d", color: "white", border: "none", padding: "8px 14px", borderRadius: "8px", cursor: "pointer", zIndex: 1000 }}>Logout</button>
      </div>

      <div style={{ width: "90%", maxWidth: "850px", margin: "30px auto", background: "white", padding: "20px", borderRadius: "10px", boxShadow: "0 4px 15px rgba(0,0,0,0.1)" }}>

        {/* Resume Upload */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontWeight: "600", marginBottom: "10px", fontSize: "18px" }}>Resume Upload</label>
          <div
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            onClick={() => { if (!isFileProcessing && !resume) document.getElementById("fileUploadInput").click(); }}
            style={{
              border: isDragging ? "2px dashed #667eea" : (resume ? "2px solid #4caf50" : "2px dashed #ccc"),
              borderRadius: "12px", padding: "40px 20px", textAlign: "center",
              backgroundColor: isDragging ? "#f0f4ff" : (resume ? "#f1f8e9" : "#fafafa"),
              cursor: (isFileProcessing || resume) ? "default" : "pointer", transition: "all 0.3s ease"
            }}
          >
            {isFileProcessing && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <svg width="40" height="40" viewBox="0 0 50 50" style={{ animation: "spin 1s linear infinite" }}>
                  <circle cx="25" cy="25" r="20" fill="none" stroke="#667eea" strokeWidth="5" strokeDasharray="31.4 31.4" strokeLinecap="round"></circle>
                </svg>
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                <p style={{ marginTop: "15px", fontWeight: "600", color: "#667eea" }}>Processing {fileName}...</p>
              </div>
            )}

            {!isFileProcessing && resume && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ background: "#4caf50", color: "white", borderRadius: "50%", width: "50px", height: "50px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", marginBottom: "15px" }}>✓</div>
                <p style={{ fontWeight: "600", fontSize: "16px", color: "#2e7d32", margin: "0 0 5px 0" }}>Upload Successful!</p>
                <p style={{ fontSize: "14px", color: "#555", margin: "0 0 15px 0" }}>{fileName}</p>
                <button onClick={removeFile} style={{ background: "#ff4d4d", color: "white", border: "none", padding: "6px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Remove & Upload Another</button>
              </div>
            )}

            {!isFileProcessing && !resume && (
              <>
                <p style={{ fontWeight: "600", fontSize: "16px", color: isDragging ? "#667eea" : "#555", marginBottom: "8px" }}>{isDragging ? "Drop your resume here..." : "Drag & Drop your resume here"}</p>
                <p style={{ fontSize: "14px", color: "#888", marginBottom: "15px" }}>OR</p>
                <span style={{ background: "#667eea", color: "white", padding: "10px 20px", borderRadius: "8px", fontSize: "14px", fontWeight: "500" }}>Browse Files</span>
              </>
            )}

            <input id="fileUploadInput" type="file" style={{ display: "none" }} onChange={(e) => handleFileProcess(e.target.files[0])} accept=".txt,.pdf,.doc,.docx" />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex",flexWrap: "wrap",gap: "10px", marginTop: "20px" }}>
          <button style={{ ...btn,flex: "1 1 100%", opacity: resume ? 1 : 0.5 }} disabled={!resume} onClick={generateQuestions}>Generate Questions</button>
          <button style={{ ...btn,flex: "1 1 100%", opacity: resume ? 1 : 0.5 }} disabled={!resume} onClick={analyzeResume}>Analyze Resume</button>
          <button style={{ ...btn,flex: "1 1 100%", opacity: resume ? 1 : 0.5 }} disabled={!resume} onClick={analyzePerformance}>Analyze Performance</button>
        </div>

        {/* Resume Analysis */}
        {analysis && (
          <div style={{ marginTop: "25px", padding: "20px", background: "#f8f9fa", borderRadius: "10px", borderLeft: "4px solid #667eea" }}>
            <h3 style={{ marginTop: 0, color: "#333" }}>Resume Analysis</h3>
            <p><b>ATS Score:</b> 
  <span style={{ color: analysis.score > 70 ? "green" : "red" }}>
    {analysis.score}
  </span>
</p>
            <div style={{
  height: "10px",
  background: "#eee",
  borderRadius: "10px",
  overflow: "hidden",
  marginTop: "5px"
}}>
  <div style={{
    width: `${analysis.score}%`,
    background: "#4caf50",
    height: "100%"
  }}></div>
</div>
            <p><b>Skills:</b> {analysis.skills}</p>
            <p><b>Jobs:</b> {analysis.jobs}</p>
            <p><b>Weak Areas:</b> {analysis.weak}</p>
            <p><b>Suggestions:</b> {analysis.suggestions}</p>
          </div>
        )}

        {/* Performance Score + Chart */}
        {performance && (
          <div style={{ marginTop: "25px", padding: "20px", background: "#f0f4ff", borderRadius: "10px", borderLeft: "4px solid #667eea" }}>
            <h3 style={{ marginTop: 0, color: "#333" }}>Performance Score: {performance} / 10</h3>
            {chartData.length > 0 && (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 10]} />
                  <Tooltip />
                  <Bar dataKey="score" fill="#667eea" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Download Report Button */}
        {(analysis || performance) && (
          <button
            onClick={downloadReport}
            style={{ ...btn, marginTop: "15px", background: "#4caf50", width: "100%", flex: "none" }}
          >
            📄 Download Report as PDF
          </button>
        )}

        {/* Interview Questions */}
        {questions.length > 0 && (
          <div style={{ marginTop: "30px" }}>
            <h3 style={{ color: "#333", borderBottom: "2px solid #eee", paddingBottom: "10px" }}>Interview Questions</h3>
            {questions.map((q, i) => (
              <div key={i} style={{ marginTop: "20px", padding: "15px", background: "#fff", border: "1px solid #ddd", borderRadius: "8px" }}>
                <p style={{ fontSize: "16px", color: "#222" }}><b>Q{i + 1}:</b> {q}</p>
                <textarea
                  placeholder="Type your answer here or use voice input..."
                  style={{ ...inputStyle, minHeight: "100px", resize: "vertical" }}
                  value={answers[i] || ""}
                  onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                />
                <div style={{ display: "flex",
flexWrap: "wrap",
gap: "10px", marginTop: "10px" }}>
                  <button style={{ ...btn, background: "#4caf50", flex: "none", width: "120px" }} onClick={() => startVoiceInput(i)}>🎤 Speak</button>
                  <button style={{ ...btn, flex: "none", width: "120px" }} onClick={() => evaluateAnswer(i)}>Evaluate</button>
                </div>
                {feedback[i] && (
                  <div style={{ marginTop: "15px", padding: "15px", background: "#e8f4fd", borderRadius: "6px", borderLeft: "4px solid #2196f3" }}>
                    <b style={{ color: "#1565c0" }}>Feedback:</b> {typeof feedback[i] === "string" ? feedback[i] : feedback[i]?.feedback}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* AI CHATBOT - NOW NESTED INSIDE THE MAIN WHITE CONTAINER */}
        <div style={{
          marginTop: "30px",
          padding: "20px",
          background: "#f8f9fa",
          borderRadius: "10px",
          borderLeft: "4px solid #667eea"
        }}>
          <h3 style={{ marginTop: 0, color: "#333" }}>AI Chatbot</h3>

          {/* Chat Messages */}
          <div style={{
            maxHeight: "200px",
            overflowY: "auto",
            marginBottom: "10px",
            paddingRight: "5px"
          }}>
            {chat.length === 0 && (
              <p style={{ color: "#777" }}>Ask anything about interviews...</p>
            )}

            {chat.map((c, i) => (
              <div key={i} style={{ marginBottom: "10px" }}>
                <p style={{ margin: 0 }}><b>You:</b> {c.user}</p>
                <p style={{ margin: 0, color: "#444" }}><b>Bot:</b> {c.bot}</p>
              </div>
            ))}
          </div>

          {/* Input */}
          <div style={{ display: "flex",
flexWrap: "wrap",
gap: "10px" }}>
            <input
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "6px",
                border: "1px solid #ccc"
              }}
              placeholder="Ask something..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => { if (e.key === 'Enter') sendMessage(); }}
              onKeyDown={(e) => {
  if (e.key === "Enter") sendMessage();
}}
            />

            <button style={{ ...btn, flex: "1 1 100%" }} onClick={sendMessage}>
              Send
            </button>
          </div>
        </div>
        {/* END OF AI CHATBOT */}

      </div> {/* END OF MAIN WHITE CONTAINER */}

      <p style={{ position: "fixed", bottom: "10px", right: "15px", fontSize: "12px", opacity: 0.7, color: "black" }}>Created by Tanmay</p>
    </div>
  );
}

export default App;