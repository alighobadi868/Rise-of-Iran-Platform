package org.riseofiran.platform

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

private val Navy = Color(0xFF0B1220)
private val Panel = Color(0xFF142238)
private val Gold = Color(0xFFE5BD68)
private val Pale = Color(0xFFF3F5F8)
private val Muted = Color(0xFFB2BDCD)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            var status by remember { mutableStateOf("Checking platform connection…") }
            var checking by remember { mutableStateOf(false) }
            MaterialTheme(colorScheme = darkColorScheme(
                background = Navy, surface = Panel, primary = Gold,
                onBackground = Pale, onSurface = Pale, onPrimary = Navy
            )) {
                Surface(modifier = Modifier.fillMaxSize(), color = Navy) {
                    Column(
                        modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp, vertical = 34.dp),
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text("RISE OF IRAN", color = Gold, fontSize = 13.sp, letterSpacing = 3.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(18.dp))
                        Text("A new horizon for Iran.", color = Pale, fontSize = 34.sp, lineHeight = 40.sp, fontWeight = FontWeight.Medium)
                        Spacer(Modifier.height(14.dp))
                        Text(
                            "An independent civic-research initiative focused on evidence, public participation, and a more accountable future.",
                            color = Muted, fontSize = 16.sp, lineHeight = 25.sp
                        )
                        Spacer(Modifier.height(28.dp))
                        Column(Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(14.dp)).padding(18.dp)) {
                            Text("PLATFORM STATUS", color = Gold, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
                            Spacer(Modifier.height(8.dp))
                            Text(status, color = Pale, fontSize = 14.sp)
                            Spacer(Modifier.height(16.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Button(
                                    enabled = !checking,
                                    onClick = {
                                        checking = true
                                        status = "Checking platform connection…"
                                        lifecycleScope.launch {
                                            status = withContext(Dispatchers.IO) { checkApi() }
                                            checking = false
                                        }
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = Gold, contentColor = Navy)
                                ) { Text(if (checking) "Checking…" else "Check connection") }
                            }
                        }
                        Spacer(Modifier.height(18.dp))
                        Button(
                            onClick = {
                                val url = BuildConfig.PLATFORM_BASE_URL
                                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Panel, contentColor = Pale)
                        ) { Text("Open platform website") }
                        Spacer(Modifier.height(24.dp))
                        Text("Privacy-first by design · No identity-document collection", color = Muted, fontSize = 12.sp)
                    }
                }
            }
        }
    }

    private fun checkApi(): String {
        val base = BuildConfig.PLATFORM_BASE_URL.trimEnd('/')
        if (base.endsWith("example.invalid")) return "Set platformBaseUrl to your deployed HTTPS domain for release builds."
        return try {
            val connection = (URL("$base/api/health").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 5000
                readTimeout = 5000
            }
            try {
                if (connection.responseCode in 200..299) "Platform API is reachable." else "API returned HTTP ${connection.responseCode}."
            } finally { connection.disconnect() }
        } catch (_: Exception) {
            "Could not reach the API. Check the server and configured URL."
        }
    }
}
