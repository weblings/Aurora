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
  }


  std::optional<HttpResponse> sendHttpRequest(
    const std::string& url,
    const std::string& method,
    const std::string& body,
    const HttpHeaders& headers
  )
  {
    auto handle = std::unique_ptr<CURL, CurlDeleter>(curl_easy_init());
    if(!handle){
      throw std::runtime_error("CURL initialization failed");
    }

    curl_easy_setopt(handle.get(), CURLOPT_URL, url.c_str());
    curl_easy_setopt(handle.get(), CURLOPT_CUSTOMREQUEST, method.c_str());
    curl_easy_setopt(handle.get(), CURLOPT_TIMEOUT, 1);

    // Requirement for self-signed Hue bridge certs.
    curl_easy_setopt(handle.get(), CURLOPT_SSL_VERIFYPEER, false);
    curl_easy_setopt(handle.get(), CURLOPT_SSL_VERIFYHOST, false);

    if(!body.empty()){
      curl_easy_setopt(handle.get(), CURLOPT_POSTFIELDS, body.c_str());
      curl_easy_setopt(handle.get(), CURLOPT_POSTFIELDSIZE, body.length());
    }

    UniqueCurlSlist concatenatedHeaders{nullptr};
    if(!headers.empty()){
      for(const auto& header : headers){
        std::string concat = header.first + ": " + header.second;
        concatenatedHeaders.reset(curl_slist_append(concatenatedHeaders.release(), concat.c_str()));
      }

      curl_easy_setopt(handle.get(), CURLOPT_HTTPHEADER, concatenatedHeaders.get());
    }

    std::string responseBody;
    curl_easy_setopt(handle.get(), CURLOPT_WRITEFUNCTION, writeCallback);
    curl_easy_setopt(handle.get(), CURLOPT_WRITEDATA, &responseBody);

    CURLcode code = curl_easy_perform(handle.get());
    curl_easy_setopt(handle.get(), CURLOPT_HTTPHEADER, nullptr);

    if(code != CURLE_OK){
      return std::nullopt;
    }

    return HttpResponse(std::move(responseBody));
  }
}
