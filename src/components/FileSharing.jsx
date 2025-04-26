import React, { useState, useEffect } from "react";
import {
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc,
    serverTimestamp,
    query,
    orderBy,
    getDoc,
} from "firebase/firestore";
import { db, auth } from "../firebase";

const FileSharing = ({ teamId }) => {
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [currentUser, setCurrentUser] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [error, setError] = useState(null);

    // Cloudinary configuration
    const CLOUDINARY_CLOUD_NAME = "dygizq4u0";
    const CLOUDINARY_API_KEY = "321447574991115";
    const CLOUDINARY_UPLOAD_PRESET = "team_files";

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                setCurrentUser(user);
                const fetchUserRole = async () => {
                    try {
                        const userDoc = await getDoc(doc(db, 'users', user.uid));
                        if (userDoc.exists()) {
                            setUserRole(userDoc.data().role);
                        }
                    } catch (error) {
                        console.error('Error fetching user role:', error);
                    }
                };
                fetchUserRole();
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (teamId) {
            fetchFiles();
        }
    }, [teamId]);

    const fetchFiles = async () => {
        try {
            const q = query(
                collection(db, "teams", teamId, "files"),
                orderBy("uploadedAt", "desc")
            );
            const querySnapshot = await getDocs(q);
            const filesData = querySnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
            setFiles(filesData);
        } catch (error) {
            console.error("Error fetching files:", error);
            setError("Failed to fetch files.");
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
            setError(null);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) {
            setError("Please select a file first");
            return;
        }

        setUploading(true);
        setUploadProgress(0);
        setError(null);

        try {
            // Create form data for Cloudinary upload
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
            formData.append('api_key', CLOUDINARY_API_KEY);
            formData.append('timestamp', Math.round((new Date).getTime() / 1000));

            // Upload to Cloudinary with proper headers
            const response = await fetch(
                `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
                {
                    method: 'POST',
                    body: formData,
                    mode: 'cors',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Accept': 'application/json',
                    },
                    credentials: 'omit'
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Failed to upload to Cloudinary: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();

            // Save file metadata to Firestore
            const fileExtension = selectedFile.name.split('.').pop().toLowerCase();
            await addDoc(collection(db, "teams", teamId, "files"), {
                fileName: selectedFile.name,
                fileType: selectedFile.type || "unknown",
                fileSize: selectedFile.size,
                uploadedBy: currentUser?.email || "unknown",
                uploadedAt: serverTimestamp(),
                downloadURL: data.secure_url,
                publicId: data.public_id,
                resourceType: data.resource_type,
                format: fileExtension || data.format,
                originalFormat: fileExtension
            });

            await fetchFiles();
            setSelectedFile(null);
        } catch (error) {
            console.error("Upload error:", error);
            setError("Failed to upload file: " + error.message);
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    };

    const handleDeleteFile = async (fileId) => {
        if (!window.confirm("Are you sure you want to delete this file?")) return;

        try {
            // Delete from Firestore
            await deleteDoc(doc(db, "teams", teamId, "files", fileId));
            setFiles((prev) => prev.filter((file) => file.id !== fileId));
        } catch (error) {
            console.error("Delete failed:", error);
            setError("Failed to delete file: " + error.message);
        }
    };

    const handleDownload = async (file) => {
        try {
            const response = await fetch(file.downloadURL);
            if (!response.ok) {
                throw new Error(`Failed to download file: ${response.statusText}`);
            }

            const blob = await response.blob();
            const blobWithType = new Blob([blob], { type: file.fileType });
            const url = window.URL.createObjectURL(blobWithType);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.fileName;
            document.body.appendChild(a);
            a.click();

            // Clean up
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }, 100);
        } catch (error) {
            console.error("Download failed:", error);
            setError("Failed to download file: " + error.message);
        }
    };

    const getFileIcon = (fileType) => {
        if (fileType.includes('image')) return '🖼️';
        if (fileType.includes('pdf')) return '📄';
        if (fileType.includes('word') || fileType.includes('document')) return '📝';
        if (fileType.includes('excel') || fileType.includes('sheet')) return '📊';
        if (fileType.includes('video')) return '🎥';
        if (fileType.includes('audio')) return '🎵';
        if (fileType.includes('zip') || fileType.includes('rar')) return '📦';
        if (fileType.includes('powerpoint') || fileType.includes('presentation')) return '🎯';
        if (fileType.includes('code') || fileType.includes('text')) return '📋';
        return '📁';
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + " B";
        else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
        else return (bytes / 1048576).toFixed(1) + " MB";
    };

    if (!teamId) {
        return <div className="p-4 text-gray-500">No team selected</div>;
    }

    return (
        <div className="p-6 bg-white rounded-lg shadow-md">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Team Files</h2>

            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
                    {error}
                    {error.includes("CORS") && (
                        <div className="mt-2 text-sm">
                            <p>This appears to be a CORS issue. You may need to:</p>
                            <ul className="list-disc ml-5 mt-1">
                                <li>Configure your Cloudinary account to allow your domain</li>
                                <li>Or implement a server-side upload proxy</li>
                            </ul>
                        </div>
                    )}
                </div>
            )}

            <div className="mb-8 bg-gray-50 p-6 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold mb-4 text-gray-700">Upload New File</h3>
                <div className="flex flex-col space-y-4">
                    <div className="flex items-center space-x-4">
                        <input
                            type="file"
                            onChange={handleFileSelect}
                            disabled={uploading}
                            className="block w-full text-sm text-gray-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-full file:border-0
                                file:text-sm file:font-semibold
                                file:bg-blue-50 file:text-blue-700
                                hover:file:bg-blue-100"
                        />
                        {selectedFile && (
                            <button
                                onClick={handleUpload}
                                disabled={uploading}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                            >
                                {uploading ? `Uploading...` : 'Upload'}
                            </button>
                        )}
                    </div>
                    {selectedFile && (
                        <p className="text-sm text-gray-600">
                            Selected file: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                        </p>
                    )}
                    {uploading && (
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div
                                className="bg-blue-600 h-2.5 rounded-full"
                                style={{ width: `${uploadProgress}%` }}
                            ></div>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-4">
                {files.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-4">
                            <div className="text-2xl">
                                {getFileIcon(file.fileType)}
                            </div>
                            <div>
                                <p className="font-medium text-gray-900">{file.fileName}</p>
                                <p className="text-sm text-gray-500">
                                    {formatFileSize(file.fileSize)} • {file.fileType} • Uploaded by {file.uploadedBy}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => handleDownload(file)}
                                className="text-blue-600 hover:text-blue-800"
                                title="Download file"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </button>
                            {(userRole === 'teacher' || file.uploadedBy === currentUser?.email) && (
                                <button
                                    onClick={() => handleDeleteFile(file.id)}
                                    className="text-red-600 hover:text-red-800"
                                    title="Delete file"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                {files.length === 0 && (
                    <p className="text-gray-500 text-center py-4">No files uploaded yet.</p>
                )}
            </div>
        </div>
    );
};

export default FileSharing;