import { useState, useRef, useCallback } from 'react';
import { supabase, lovableFunctions } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useVoiceInput = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const { toast } = useToast();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start();
      recordingStartTimeRef.current = Date.now();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Microphone Error",
        description: "Could not access microphone",
        variant: "destructive",
      });
    }
  }, [toast]);

  const stopRecording = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!mediaRecorderRef.current) {
        reject(new Error('No recording in progress'));
        return;
      }

      mediaRecorderRef.current.onstop = async () => {
        setIsRecording(false);
        
        // Check minimum recording duration (500ms)
        const recordingDuration = Date.now() - recordingStartTimeRef.current;
        const MIN_RECORDING_DURATION = 500; // 500ms minimum
        
        if (recordingDuration < MIN_RECORDING_DURATION) {
          toast({
            title: "Recording Too Short",
            description: "Please hold the button for at least half a second",
            variant: "destructive",
          });
          reject(new Error('Recording too short'));
          return;
        }

        setIsProcessing(true);

        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        
        // Convert to base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result?.toString().split(',')[1];
          
          if (!base64Audio) {
            setIsProcessing(false);
            reject(new Error('Failed to convert audio'));
            return;
          }

          try {
            // Call edge function for transcription
            const { data, error } = await lovableFunctions.functions.invoke('transcribe-audio', {
              body: { audio: base64Audio, mime_type: audioBlob.type || 'audio/webm' }
            });

            setIsProcessing(false);

            if (error) throw error;
            
            resolve(data.text || '');
          } catch (error) {
            console.error('Transcription error:', error);
            setIsProcessing(false);
            toast({
              title: "Transcription Error",
              description: "Failed to process voice input",
              variant: "destructive",
            });
            reject(error);
          }
        };
      };

      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    });
  }, [toast]);

  return {
    isRecording,
    isProcessing,
    startRecording,
    stopRecording,
  };
};
