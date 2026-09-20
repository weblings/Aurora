#include <Aurora/Output/Hue/HttpClient.hpp>

#include <memory>

#include <curl/curl.h>
#include <curl/easy.h>

namespace Aurora::Output::Hue
{
  namespace
  {
    struct CurlDeleter
    {
      void operator()(CURL* curl) const { curl_easy_cleanup(curl); }
    };

    struct CurlSlistDeleter
    {
      void operator()(curl_slist* slist) const { curl_slist_free_all(slist); }
    };

    using UniqueCurlSlist = std::unique_ptr<curl_slist, CurlSlistDeleter>;

    size_t writeCallback(char* ptr, size_t size, size_t nmemb, std::string* data)
    {
      data->append(ptr, size * nmemb);
      return size * nmemb;
    }

    // One handle per calling thread, reused across requests so the bridge
    // calls a reload makes back-to-back (~5 per HueOutput::init, 2 more per
    // channels fetch) share a keep-alive connection instead of paying a
    // fresh TCP+TLS setup every time. thread_local because a handle must
    // never cross threads (route handlers run on the HTTP server's pool);
    // cleaned up at thread exit. curl_easy_reset() on every borrow clears
    // all state, so each request still sets its full option set explicitly
    // below -- nothing leaks from one call into the next.
    thread_local std::unique_ptr<CURL, CurlDeleter> t_reusedHandle;

    CURL* _borrowHandle()
    {
      if(!t_reusedHandle){
        t_reusedHandle.reset(curl_easy_init());
        if(!t_reusedHandle){
          throw std::runtime_error("CURL initialization failed");
        }
      }
      else{
        curl_easy_reset(t_reusedHandle.get());
      }

      return t_reusedHandle.get();
    }
  }


  std::optional<HttpResponse> sendHttpRequest(
    const std::string& url,
    const std::string& method,
    const std::string& body,
    const HttpHeaders& headers
  )
  {
    // Borrowed, not owned: the thread-local handle outlives this call, so
    // the header detach below (before concatenatedHeaders dies) is a
    // correctness requirement now, not just tidiness.
    CURL* handle = _borrowHandle();

    curl_easy_setopt(handle, CURLOPT_URL, url.c_str());
    curl_easy_setopt(handle, CURLOPT_CUSTOMREQUEST, method.c_str());
    curl_easy_setopt(handle, CURLOPT_TIMEOUT, 1);

    // Requirement for self-signed Hue bridge certs.
    curl_easy_setopt(handle, CURLOPT_SSL_VERIFYPEER, false);
    curl_easy_setopt(handle, CURLOPT_SSL_VERIFYHOST, false);

    if(!body.empty()){
      curl_easy_setopt(handle, CURLOPT_POSTFIELDS, body.c_str());
      curl_easy_setopt(handle, CURLOPT_POSTFIELDSIZE, body.length());
    }

    UniqueCurlSlist concatenatedHeaders{nullptr};
    if(!headers.empty()){
      for(const auto& header : headers){
        std::string concat = header.first + ": " + header.second;
        concatenatedHeaders.reset(curl_slist_append(concatenatedHeaders.release(), concat.c_str()));
      }

      curl_easy_setopt(handle, CURLOPT_HTTPHEADER, concatenatedHeaders.get());
    }

    std::string responseBody;
    curl_easy_setopt(handle, CURLOPT_WRITEFUNCTION, writeCallback);
    curl_easy_setopt(handle, CURLOPT_WRITEDATA, &responseBody);

    CURLcode code = curl_easy_perform(handle);
    curl_easy_setopt(handle, CURLOPT_HTTPHEADER, nullptr);

    if(code != CURLE_OK){
      return std::nullopt;
    }

    return HttpResponse(std::move(responseBody));
  }
}
